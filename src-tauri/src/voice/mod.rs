use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::http::Request, tungstenite::Message};
use uuid::Uuid;

pub const VOICE_TRANSCRIPTION_STARTED_EVENT: &str = "voice/transcription-started";
pub const VOICE_TRANSCRIPTION_STATUS_EVENT: &str = "voice/transcription-status";
pub const VOICE_TRANSCRIPTION_COMPLETED_EVENT: &str = "voice/transcription-completed";
pub const VOICE_TRANSCRIPTION_FAILED_EVENT: &str = "voice/transcription-failed";
const ALIYUN_REALTIME_PROVIDER: &str = "aliyun-paraformer-realtime";
const ALIYUN_REALTIME_MODEL: &str = "paraformer-realtime-v2";
const ALIYUN_REALTIME_ENDPOINT: &str = "wss://dashscope.aliyuncs.com/api-ws/v1/inference";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartVoiceTranscriptionRequest {
    pub provider: String,
    pub api_key: String,
    pub language: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartVoiceTranscriptionResponse {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTranscriptionStartedEvent {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTranscriptionStatusEvent {
    pub session_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTranscriptionCompletedEvent {
    pub session_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTranscriptionFailedEvent {
    pub session_id: String,
    pub message: String,
}

#[derive(Debug)]
enum VoiceSessionCommand {
    Stop,
    Cancel,
}

#[derive(Default)]
pub struct VoiceTranscriptionManager {
    sessions: Mutex<HashMap<String, mpsc::UnboundedSender<VoiceSessionCommand>>>,
}

impl VoiceTranscriptionManager {
    pub fn start_session(
        self: &Arc<Self>,
        app: AppHandle,
        request: StartVoiceTranscriptionRequest,
    ) -> Result<StartVoiceTranscriptionResponse> {
        validate_start_request(&request)?;

        let session_id = Uuid::new_v4().to_string();
        let (command_tx, command_rx) = mpsc::unbounded_channel();
        self.sessions
            .lock()
            .expect("voice manager mutex poisoned")
            .insert(session_id.clone(), command_tx);

        let manager = Arc::clone(self);
        let task_session_id = session_id.clone();
        tauri::async_runtime::spawn(async move {
            let result =
                run_voice_session(app.clone(), task_session_id.clone(), request, command_rx).await;
            manager.finish_session(&task_session_id);

            if let Err(error) = result {
                emit_failed(&app, &task_session_id, error.to_string());
            }
        });

        Ok(StartVoiceTranscriptionResponse { session_id })
    }

    pub fn stop_session(&self, session_id: &str) -> Result<()> {
        self.send_command(session_id, VoiceSessionCommand::Stop)
    }

    pub fn cancel_session(&self, session_id: &str) -> Result<()> {
        self.send_command(session_id, VoiceSessionCommand::Cancel)
    }

    fn send_command(&self, session_id: &str, command: VoiceSessionCommand) -> Result<()> {
        let maybe_sender = self
            .sessions
            .lock()
            .expect("voice manager mutex poisoned")
            .get(session_id)
            .cloned();

        if let Some(sender) = maybe_sender {
            sender
                .send(command)
                .map_err(|_| anyhow!("voice session {session_id} is no longer active"))?;
        }

        Ok(())
    }

    fn finish_session(&self, session_id: &str) {
        self.sessions
            .lock()
            .expect("voice manager mutex poisoned")
            .remove(session_id);
    }
}

struct AudioCapture {
    stream: cpal::Stream,
    receiver: mpsc::UnboundedReceiver<Vec<u8>>,
    sample_rate: u32,
}

async fn run_voice_session(
    app: AppHandle,
    session_id: String,
    request: StartVoiceTranscriptionRequest,
    mut command_rx: mpsc::UnboundedReceiver<VoiceSessionCommand>,
) -> Result<()> {
    emit_status(&app, &session_id, "Connecting to Bailian…");

    let websocket_request = build_websocket_request(&request.api_key)?;
    let (websocket, _) = connect_async(websocket_request)
        .await
        .context("failed to connect to Bailian realtime websocket")?;
    let (mut sink, mut stream) = websocket.split();

    let audio_capture = build_audio_capture()?;
    let sample_rate = audio_capture.sample_rate;
    let mut audio_receiver = audio_capture.receiver;
    let mut audio_stream = Some(audio_capture.stream);
    let mut task_started = false;
    let mut finish_sent = false;
    let mut final_text = String::new();

    sink.send(Message::Text(
        build_run_task_message(&session_id, sample_rate, &request.language).into(),
    ))
    .await
    .context("failed to send Bailian run-task")?;

    loop {
        tokio::select! {
            command = command_rx.recv() => {
                match command {
                    Some(VoiceSessionCommand::Cancel) => {
                        audio_stream.take();
                        return Ok(());
                    }
                    Some(VoiceSessionCommand::Stop) => {
                        if task_started && !finish_sent {
                            audio_stream.take();
                            finish_sent = true;
                            emit_status(&app, &session_id, "Transcribing…");
                            sink.send(Message::Text(build_finish_task_message(&session_id).into()))
                                .await
                                .context("failed to send Bailian finish-task")?;
                        }
                    }
                    None => return Ok(()),
                }
            }
            maybe_chunk = audio_receiver.recv(), if task_started && !finish_sent => {
                match maybe_chunk {
                    Some(chunk) => {
                        if !chunk.is_empty() {
                            sink.send(Message::Binary(chunk.into()))
                                .await
                                .context("failed to stream microphone audio")?;
                        }
                    }
                    None => {
                        if !finish_sent {
                            finish_sent = true;
                            sink.send(Message::Text(build_finish_task_message(&session_id).into()))
                                .await
                                .context("failed to finalize after audio channel closed")?;
                        }
                    }
                }
            }
            maybe_message = stream.next() => {
                let Some(message_result) = maybe_message else {
                    break;
                };

                let message = message_result.context("voice websocket closed unexpectedly")?;
                match parse_server_message(message)? {
                    ServerMessage::TaskStarted => {
                        if !task_started {
                            task_started = true;
                            audio_stream
                                .as_ref()
                                .context("microphone stream missing before start")?
                                .play()
                                .context("failed to start microphone capture")?;
                            emit_started(&app, &session_id);
                            emit_status(&app, &session_id, "Listening…");
                        }
                    }
                    ServerMessage::ResultGenerated { text } => {
                        if let Some(text) = text {
                            final_text = text;
                        }
                    }
                    ServerMessage::TaskFinished => {
                        emit_completed(&app, &session_id, final_text.trim());
                        return Ok(());
                    }
                    ServerMessage::TaskFailed { message } => {
                        return Err(anyhow!(message));
                    }
                    ServerMessage::Ignore => {}
                }
            }
        }
    }

    Ok(())
}

fn validate_start_request(request: &StartVoiceTranscriptionRequest) -> Result<()> {
    if request.provider.trim().to_lowercase() != ALIYUN_REALTIME_PROVIDER {
        return Err(anyhow!("unsupported speech provider"));
    }

    if request.api_key.trim().is_empty() {
        return Err(anyhow!("speech api key is required"));
    }

    match request.language.trim().to_lowercase().as_str() {
        "auto" | "zh" | "en" => Ok(()),
        _ => Err(anyhow!("unsupported speech language")),
    }
}

fn build_websocket_request(api_key: &str) -> Result<Request<()>> {
    Request::builder()
        .uri(ALIYUN_REALTIME_ENDPOINT)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .body(())
        .map_err(|error| anyhow!("failed to build websocket request: {error}"))
}

fn build_run_task_message(session_id: &str, sample_rate: u32, language: &str) -> String {
    json!({
        "header": {
            "action": "run-task",
            "task_id": session_id,
            "streaming": "duplex"
        },
        "payload": {
            "task_group": "audio",
            "task": "asr",
            "function": "recognition",
            "model": ALIYUN_REALTIME_MODEL,
            "parameters": {
                "format": "pcm",
                "sample_rate": sample_rate,
                "disfluency_removal_enabled": false,
                "punctuation_prediction_enabled": true,
                "inverse_text_normalization_enabled": true,
                "language_hints": language_hints(language),
            },
            "input": {}
        }
    })
    .to_string()
}

fn build_finish_task_message(session_id: &str) -> String {
    json!({
        "header": {
            "action": "finish-task",
            "task_id": session_id,
            "streaming": "duplex"
        },
        "payload": {
            "input": {}
        }
    })
    .to_string()
}

fn language_hints(language: &str) -> Vec<&'static str> {
    match language.trim().to_lowercase().as_str() {
        "zh" => vec!["zh"],
        "en" => vec!["en"],
        _ => vec!["zh", "en"],
    }
}

enum ServerMessage {
    TaskStarted,
    ResultGenerated { text: Option<String> },
    TaskFinished,
    TaskFailed { message: String },
    Ignore,
}

fn parse_server_message(message: Message) -> Result<ServerMessage> {
    match message {
        Message::Text(payload) => parse_server_event(payload.as_str()),
        Message::Binary(_) | Message::Ping(_) | Message::Pong(_) | Message::Frame(_) => {
            Ok(ServerMessage::Ignore)
        }
        Message::Close(_) => Ok(ServerMessage::TaskFinished),
    }
}

fn parse_server_event(payload: &str) -> Result<ServerMessage> {
    let value: Value =
        serde_json::from_str(payload).context("failed to parse voice event payload")?;
    let event = value
        .get("header")
        .and_then(|header| header.get("event"))
        .and_then(Value::as_str)
        .unwrap_or_default();

    let task_id = value
        .get("header")
        .and_then(|header| header.get("task_id"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    if task_id.is_empty() && event.is_empty() {
        return Ok(ServerMessage::Ignore);
    }

    match event {
        "task-started" => Ok(ServerMessage::TaskStarted),
        "result-generated" => Ok(ServerMessage::ResultGenerated {
            text: value
                .get("payload")
                .and_then(|payload| payload.get("output"))
                .and_then(|output| output.get("sentence"))
                .and_then(|sentence| sentence.get("text"))
                .and_then(Value::as_str)
                .map(str::to_string),
        }),
        "task-finished" => Ok(ServerMessage::TaskFinished),
        "task-failed" => Ok(ServerMessage::TaskFailed {
            message: value
                .get("header")
                .and_then(|header| header.get("error_message"))
                .and_then(Value::as_str)
                .unwrap_or("voice task failed")
                .to_string(),
        }),
        _ => Ok(ServerMessage::Ignore),
    }
}

fn build_audio_capture() -> Result<AudioCapture> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| anyhow!("no microphone input device available"))?;
    let supported_config = device
        .default_input_config()
        .context("failed to read default microphone configuration")?;
    let sample_rate = supported_config.sample_rate().0;
    let channels = supported_config.channels().max(1) as usize;
    let config: cpal::StreamConfig = supported_config.clone().into();
    let (audio_tx, audio_rx) = mpsc::unbounded_channel();
    let error_tx = audio_tx.clone();
    let error_callback = move |error| {
        let _ = error_tx.send(Vec::new());
        eprintln!("[praw-voice] microphone stream error: {error}");
    };

    let stream = match supported_config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _| {
                let _ = audio_tx.send(encode_f32_frames(data, channels));
            },
            error_callback,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config,
            move |data: &[i16], _| {
                let _ = audio_tx.send(encode_i16_frames(data, channels));
            },
            error_callback,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &config,
            move |data: &[u16], _| {
                let _ = audio_tx.send(encode_u16_frames(data, channels));
            },
            error_callback,
            None,
        ),
        sample_format => {
            return Err(anyhow!(
                "unsupported microphone sample format: {sample_format:?}"
            ));
        }
    }
    .context("failed to open microphone stream")?;

    Ok(AudioCapture {
        stream,
        receiver: audio_rx,
        sample_rate,
    })
}

fn encode_i16_frames(data: &[i16], channels: usize) -> Vec<u8> {
    let mut output = Vec::with_capacity(data.len().saturating_mul(2) / channels.max(1));
    for frame in data.chunks(channels.max(1)) {
        let sum: i32 = frame.iter().map(|sample| *sample as i32).sum();
        let mono = (sum / frame.len() as i32) as i16;
        output.extend_from_slice(&mono.to_le_bytes());
    }
    output
}

fn encode_f32_frames(data: &[f32], channels: usize) -> Vec<u8> {
    let samples: Vec<i16> = data
        .iter()
        .map(|sample| (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect();
    encode_i16_frames(&samples, channels)
}

fn encode_u16_frames(data: &[u16], channels: usize) -> Vec<u8> {
    let samples: Vec<i16> = data
        .iter()
        .map(|sample| (*sample as i32 - i16::MAX as i32 - 1) as i16)
        .collect();
    encode_i16_frames(&samples, channels)
}

fn emit_started(app: &AppHandle, session_id: &str) {
    let _ = app.emit(
        VOICE_TRANSCRIPTION_STARTED_EVENT,
        VoiceTranscriptionStartedEvent {
            session_id: session_id.to_string(),
        },
    );
}

fn emit_status(app: &AppHandle, session_id: &str, message: &str) {
    let _ = app.emit(
        VOICE_TRANSCRIPTION_STATUS_EVENT,
        VoiceTranscriptionStatusEvent {
            session_id: session_id.to_string(),
            message: message.to_string(),
        },
    );
}

fn emit_completed(app: &AppHandle, session_id: &str, text: &str) {
    let _ = app.emit(
        VOICE_TRANSCRIPTION_COMPLETED_EVENT,
        VoiceTranscriptionCompletedEvent {
            session_id: session_id.to_string(),
            text: text.to_string(),
        },
    );
}

fn emit_failed(app: &AppHandle, session_id: &str, message: String) {
    let _ = app.emit(
        VOICE_TRANSCRIPTION_FAILED_EVENT,
        VoiceTranscriptionFailedEvent {
            session_id: session_id.to_string(),
            message,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::{
        build_finish_task_message, build_run_task_message, language_hints, parse_server_event,
        validate_start_request, ServerMessage, StartVoiceTranscriptionRequest,
    };
    use serde_json::Value;

    #[test]
    fn builds_run_task_message_with_language_hints_and_normalization_flags() {
        let message = build_run_task_message("session-1", 44_100, "auto");
        let value: Value =
            serde_json::from_str(&message).expect("run-task payload should be valid json");

        assert_eq!(
            value.pointer("/header/action").and_then(Value::as_str),
            Some("run-task")
        );
        assert_eq!(
            value.pointer("/payload/model").and_then(Value::as_str),
            Some("paraformer-realtime-v2")
        );
        assert_eq!(
            value
                .pointer("/payload/parameters/sample_rate")
                .and_then(Value::as_u64),
            Some(44_100)
        );
        assert_eq!(
            value
                .pointer("/payload/parameters/punctuation_prediction_enabled")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            value
                .pointer("/payload/parameters/inverse_text_normalization_enabled")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            value
                .pointer("/payload/parameters/disfluency_removal_enabled")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            value
                .pointer("/payload/parameters/language_hints")
                .and_then(Value::as_array)
                .map(|items| items.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec!["zh", "en"])
        );
    }

    #[test]
    fn builds_finish_task_message_with_matching_task_id() {
        let message = build_finish_task_message("session-1");
        let value: Value =
            serde_json::from_str(&message).expect("finish-task payload should be valid json");

        assert_eq!(
            value.pointer("/header/action").and_then(Value::as_str),
            Some("finish-task")
        );
        assert_eq!(
            value.pointer("/header/task_id").and_then(Value::as_str),
            Some("session-1")
        );
        assert!(value.pointer("/payload/input").is_some());
    }

    #[test]
    fn parses_result_generated_and_failed_events() {
        let result = parse_server_event(
            r#"{
                "header": { "task_id": "session-1", "event": "result-generated", "attributes": {} },
                "payload": {
                    "output": {
                        "sentence": {
                            "text": "hello world",
                            "sentence_end": true,
                            "heartbeat": false
                        }
                    }
                }
            }"#,
        )
        .expect("result-generated payload should parse");
        match result {
            ServerMessage::ResultGenerated { text } => {
                assert_eq!(text.as_deref(), Some("hello world"))
            }
            _ => panic!("unexpected parsed message"),
        }

        let failed = parse_server_event(
            r#"{
                "header": {
                    "task_id": "session-1",
                    "event": "task-failed",
                    "error_message": "request timeout after 23 seconds."
                },
                "payload": {}
            }"#,
        )
        .expect("task-failed payload should parse");
        match failed {
            ServerMessage::TaskFailed { message } => {
                assert_eq!(message, "request timeout after 23 seconds.");
            }
            _ => panic!("unexpected parsed message"),
        }
    }

    #[test]
    fn validates_supported_start_request_shape() {
        let request = StartVoiceTranscriptionRequest {
            provider: "aliyun-paraformer-realtime".to_string(),
            api_key: "secret-key".to_string(),
            language: "zh".to_string(),
        };
        validate_start_request(&request).expect("request should be accepted");
        assert_eq!(language_hints("en"), vec!["en"]);
    }

    #[test]
    fn rejects_invalid_start_request_shape() {
        let invalid_language = StartVoiceTranscriptionRequest {
            provider: "aliyun-paraformer-realtime".to_string(),
            api_key: "secret-key".to_string(),
            language: "ja".to_string(),
        };
        assert!(validate_start_request(&invalid_language).is_err());

        let invalid_provider = StartVoiceTranscriptionRequest {
            provider: "other".to_string(),
            api_key: "secret-key".to_string(),
            language: "auto".to_string(),
        };
        assert!(validate_start_request(&invalid_provider).is_err());
    }
}
