mod normalize;
mod preset;
mod vocabulary;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::Request, Message},
};
use uuid::Uuid;

use self::{normalize::normalize_transcript, preset::SpeechPreset};
use crate::{config::AppConfig, storage};

pub const VOICE_TRANSCRIPTION_STARTED_EVENT: &str = "voice/transcription-started";
pub const VOICE_TRANSCRIPTION_STATUS_EVENT: &str = "voice/transcription-status";
pub const VOICE_TRANSCRIPTION_LIVE_EVENT: &str = "voice/transcription-live";
pub const VOICE_TRANSCRIPTION_COMPLETED_EVENT: &str = "voice/transcription-completed";
pub const VOICE_TRANSCRIPTION_FAILED_EVENT: &str = "voice/transcription-failed";
pub const VOICE_PROGRAMMER_VOCABULARY_STATE_EVENT: &str = "voice/programmer-vocabulary-state";
const ALIYUN_REALTIME_PROVIDER: &str = "aliyun-paraformer-realtime";
const ALIYUN_REALTIME_MODEL: &str = "paraformer-realtime-v2";
const ALIYUN_REALTIME_ENDPOINT: &str = "wss://dashscope.aliyuncs.com/api-ws/v1/inference";
const ALIYUN_CUSTOMIZATION_ENDPOINT: &str =
    "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/customization";
const APP_CONFIG_PATH: &str = "config/app-config.json";
const MAX_PENDING_AUDIO_CHUNKS: usize = 32;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartVoiceTranscriptionRequest {
    pub provider: String,
    pub api_key: String,
    pub language: String,
    #[serde(default = "default_start_request_preset")]
    pub preset: String,
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
pub struct VoiceTranscriptionLiveEvent {
    pub session_id: String,
    pub text: String,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceProgrammerVocabularyStateEvent {
    pub programmer_vocabulary_id: String,
    pub programmer_vocabulary_status: String,
    pub programmer_vocabulary_error: String,
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
        spawn_voice_session_thread(manager, app, task_session_id, request, command_rx);

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

fn spawn_voice_session_thread(
    manager: Arc<VoiceTranscriptionManager>,
    app: AppHandle,
    session_id: String,
    request: StartVoiceTranscriptionRequest,
    command_rx: mpsc::UnboundedReceiver<VoiceSessionCommand>,
) {
    std::thread::spawn(move || {
        let result = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .context("failed to create voice runtime")
            .and_then(|runtime| {
                runtime.block_on(run_voice_session(
                    app.clone(),
                    session_id.clone(),
                    request,
                    command_rx,
                ))
            });

        manager.finish_session(&session_id);

        if let Err(error) = result {
            emit_failed(&app, &session_id, error.to_string());
        }
    });
}

async fn run_voice_session(
    app: AppHandle,
    session_id: String,
    request: StartVoiceTranscriptionRequest,
    mut command_rx: mpsc::UnboundedReceiver<VoiceSessionCommand>,
) -> Result<()> {
    let preset = SpeechPreset::parse(&request.preset);
    let vocabulary_id =
        ensure_programmer_vocabulary(&app, &session_id, &request.api_key, preset).await;

    if vocabulary_id.is_some() || preset != SpeechPreset::Programmer {
        emit_status(&app, &session_id, "Connecting to Bailian…");
    }

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
    let mut stop_requested = false;
    let mut pending_audio_chunks: Vec<Vec<u8>> = Vec::new();
    let mut finalized_chunks: Vec<String> = Vec::new();
    let mut current_chunk = String::new();

    audio_stream
        .as_ref()
        .context("microphone stream missing before warmup")?
        .play()
        .context("failed to start microphone capture warmup")?;

    sink.send(Message::Text(
        build_run_task_message(
            &session_id,
            sample_rate,
            &request.language,
            preset,
            vocabulary_id.as_deref(),
        )
        .into(),
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
                        audio_stream.take();
                        if task_started && !finish_sent {
                            finish_sent = true;
                            emit_status(&app, &session_id, "Transcribing…");
                            sink.send(Message::Text(build_finish_task_message(&session_id).into()))
                                .await
                                .context("failed to send Bailian finish-task")?;
                        } else {
                            stop_requested = true;
                        }
                    }
                    None => return Ok(()),
                }
            }
            maybe_chunk = audio_receiver.recv(), if !finish_sent => {
                match maybe_chunk {
                    Some(chunk) => {
                        if !chunk.is_empty() {
                            if task_started {
                                sink.send(Message::Binary(chunk.into()))
                                    .await
                                    .context("failed to stream microphone audio")?;
                            } else {
                                buffer_pending_audio_chunk(&mut pending_audio_chunks, chunk);
                            }
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

                            for chunk in take_pending_audio_chunks(&mut pending_audio_chunks) {
                                sink.send(Message::Binary(chunk.into()))
                                    .await
                                    .context("failed to flush buffered microphone audio")?;
                            }

                            if stop_requested {
                                finish_sent = true;
                                emit_status(&app, &session_id, "Transcribing…");
                                sink.send(Message::Text(build_finish_task_message(&session_id).into()))
                                    .await
                                    .context("failed to send deferred Bailian finish-task")?;
                            } else {
                                emit_started(&app, &session_id);
                                emit_status(&app, &session_id, "Listening…");
                            }
                        }
                    }
                    ServerMessage::ResultGenerated { text, sentence_end } => {
                        if let Some(text) = text {
                            let transcript = accumulate_transcript_update(
                                &mut finalized_chunks,
                                &mut current_chunk,
                                &text,
                                sentence_end,
                            );
                            let normalized = normalize_transcript(&transcript, preset);
                            emit_live(&app, &session_id, &normalized);
                        }
                    }
                    ServerMessage::TaskFinished => {
                        let final_text = compose_transcript(&finalized_chunks, Some(current_chunk.as_str()));
                        let normalized = normalize_transcript(final_text.trim(), preset);
                        emit_completed(&app, &session_id, normalized.trim());
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

fn default_start_request_preset() -> String {
    "default".to_string()
}

fn build_websocket_request(api_key: &str) -> Result<Request<()>> {
    let mut request = ALIYUN_REALTIME_ENDPOINT
        .into_client_request()
        .map_err(|error| anyhow!("failed to build websocket request: {error}"))?;
    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {}", api_key.trim())
            .parse()
            .map_err(|error| anyhow!("failed to build websocket auth header: {error}"))?,
    );
    Ok(request)
}

fn build_run_task_message(
    session_id: &str,
    sample_rate: u32,
    language: &str,
    preset: SpeechPreset,
    vocabulary_id: Option<&str>,
) -> String {
    let mut payload = json!({
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
                "language_hints": language_hints(language, preset),
            },
            "input": {}
        }
    });

    if let Some(vocabulary_id) = vocabulary_id {
        payload["payload"]["parameters"]["vocabulary_id"] = json!(vocabulary_id);
    }

    payload.to_string()
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

fn language_hints(language: &str, preset: SpeechPreset) -> Vec<&'static str> {
    match language.trim().to_lowercase().as_str() {
        "zh" if preset == SpeechPreset::Programmer => vec!["zh", "en"],
        "zh" => vec!["zh"],
        "en" => vec!["en"],
        _ => vec!["zh", "en"],
    }
}

#[derive(Debug)]
enum ServerMessage {
    TaskStarted,
    ResultGenerated {
        text: Option<String>,
        sentence_end: bool,
    },
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
            sentence_end: value
                .get("payload")
                .and_then(|payload| payload.get("output"))
                .and_then(|output| output.get("sentence"))
                .and_then(|sentence| sentence.get("sentence_end"))
                .and_then(Value::as_bool)
                .unwrap_or(false),
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

fn compose_transcript(finalized_chunks: &[String], current_chunk: Option<&str>) -> String {
    let mut segments: Vec<&str> = finalized_chunks
        .iter()
        .map(String::as_str)
        .filter(|segment| !segment.trim().is_empty())
        .collect();

    if let Some(current_chunk) = current_chunk {
        if !current_chunk.trim().is_empty() {
            segments.push(current_chunk);
        }
    }

    let mut transcript = String::new();
    for segment in segments {
        let trimmed = segment.trim();
        if trimmed.is_empty() {
            continue;
        }

        if !transcript.is_empty() && needs_ascii_space(&transcript, trimmed) {
            transcript.push(' ');
        }
        transcript.push_str(trimmed);
    }

    transcript
}

fn accumulate_transcript_update(
    finalized_chunks: &mut Vec<String>,
    current_chunk: &mut String,
    next_text: &str,
    sentence_end: bool,
) -> String {
    let normalized = next_text.trim();
    if normalized.is_empty() {
        return compose_transcript(finalized_chunks, Some(current_chunk.as_str()));
    }

    current_chunk.clear();
    current_chunk.push_str(normalized);

    if sentence_end {
        if finalized_chunks.last().map(String::as_str) != Some(normalized) {
            finalized_chunks.push(normalized.to_string());
        }
        current_chunk.clear();
    }

    compose_transcript(finalized_chunks, Some(current_chunk.as_str()))
}

fn needs_ascii_space(existing: &str, next: &str) -> bool {
    let previous = existing.chars().next_back();
    let upcoming = next.chars().next();
    matches!(previous, Some(ch) if ch.is_ascii_alphanumeric())
        && matches!(upcoming, Some(ch) if ch.is_ascii_alphanumeric())
}

fn buffer_pending_audio_chunk(pending_chunks: &mut Vec<Vec<u8>>, chunk: Vec<u8>) {
    if chunk.is_empty() {
        return;
    }

    pending_chunks.push(chunk);
    if pending_chunks.len() > MAX_PENDING_AUDIO_CHUNKS {
        pending_chunks.remove(0);
    }
}

fn take_pending_audio_chunks(pending_chunks: &mut Vec<Vec<u8>>) -> Vec<Vec<u8>> {
    std::mem::take(pending_chunks)
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

fn emit_live(app: &AppHandle, session_id: &str, text: &str) {
    let _ = app.emit(
        VOICE_TRANSCRIPTION_LIVE_EVENT,
        VoiceTranscriptionLiveEvent {
            session_id: session_id.to_string(),
            text: text.to_string(),
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

fn emit_programmer_vocabulary_state(app: &AppHandle, speech: &crate::config::SpeechConfig) {
    let _ = app.emit(
        VOICE_PROGRAMMER_VOCABULARY_STATE_EVENT,
        VoiceProgrammerVocabularyStateEvent {
            programmer_vocabulary_id: speech.programmer_vocabulary_id.clone(),
            programmer_vocabulary_status: speech.programmer_vocabulary_status.clone(),
            programmer_vocabulary_error: speech.programmer_vocabulary_error.clone(),
        },
    );
}

fn persist_programmer_vocabulary_state(app: &AppHandle, config: &AppConfig) {
    let _ = storage::save_json(app, APP_CONFIG_PATH, config);
    emit_programmer_vocabulary_state(app, &config.speech);
}

async fn ensure_programmer_vocabulary(
    app: &AppHandle,
    session_id: &str,
    api_key: &str,
    preset: SpeechPreset,
) -> Option<String> {
    if preset != SpeechPreset::Programmer {
        return None;
    }

    let mut config = storage::load_or_default::<_, AppConfig>(app, APP_CONFIG_PATH).unwrap_or_default();
    let cached_id = config.speech.programmer_vocabulary_id.trim().to_string();
    if !cached_id.is_empty() {
        config.speech.programmer_vocabulary_status = "ready".to_string();
        config.speech.programmer_vocabulary_error.clear();
        persist_programmer_vocabulary_state(app, &config);
        return Some(cached_id);
    }

    config.speech.programmer_vocabulary_status = "creating".to_string();
    config.speech.programmer_vocabulary_error.clear();
    persist_programmer_vocabulary_state(app, &config);
    emit_status(app, session_id, "Preparing programmer vocabulary…");

    match create_programmer_vocabulary(api_key).await {
        Ok(vocabulary_id) => {
            config.speech.programmer_vocabulary_id = vocabulary_id.clone();
            config.speech.programmer_vocabulary_status = "ready".to_string();
            config.speech.programmer_vocabulary_error.clear();
            persist_programmer_vocabulary_state(app, &config);
            Some(vocabulary_id)
        }
        Err(error) => {
            config.speech.programmer_vocabulary_status = "failed".to_string();
            config.speech.programmer_vocabulary_error = error.to_string();
            persist_programmer_vocabulary_state(app, &config);
            emit_status(
                app,
                session_id,
                "Programmer cloud vocabulary unavailable. Using local enhancement instead.",
            );
            None
        }
    }
}

async fn create_programmer_vocabulary(api_key: &str) -> Result<String> {
    let prefix = build_programmer_vocabulary_prefix();
    let payload = vocabulary::build_programmer_vocabulary_create_payload(&prefix);

    let response = Client::new()
        .post(ALIYUN_CUSTOMIZATION_ENDPOINT)
        .bearer_auth(api_key.trim())
        .json(&payload)
        .send()
        .await
        .context("failed to request programmer vocabulary creation")?;

    let status = response.status();
    let body = response
        .text()
        .await
        .context("failed to read programmer vocabulary response body")?;

    if !status.is_success() {
        return Err(anyhow!(
            "programmer vocabulary creation failed ({status}): {body}"
        ));
    }

    let value: Value =
        serde_json::from_str(&body).context("failed to parse programmer vocabulary response")?;

    value
        .pointer("/output/vocabulary_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| anyhow!("programmer vocabulary response did not include vocabulary_id"))
}

fn build_programmer_vocabulary_prefix() -> String {
    let suffix = Uuid::new_v4().simple().to_string();
    format!("praw{}", &suffix[..6])
}

#[cfg(test)]
mod tests {
    use super::{
        accumulate_transcript_update, build_finish_task_message, build_run_task_message,
        build_websocket_request, compose_transcript, language_hints, parse_server_event,
        validate_start_request, ServerMessage, StartVoiceTranscriptionRequest,
        ALIYUN_REALTIME_ENDPOINT,
    };
    use crate::voice::preset::SpeechPreset;
    use serde_json::Value;

    #[test]
    fn builds_websocket_request_with_authorization_and_websocket_handshake_headers() {
        let request = build_websocket_request("test-key")
            .expect("websocket request should include auth and client handshake headers");

        assert_eq!(
            request.headers().get("Authorization").and_then(|value| value.to_str().ok()),
            Some("Bearer test-key")
        );
        assert!(request.headers().contains_key("sec-websocket-key"));
        assert!(request.headers().contains_key("sec-websocket-version"));
        assert_eq!(request.uri().to_string(), ALIYUN_REALTIME_ENDPOINT);
    }

    #[test]
    fn builds_run_task_message_with_language_hints_and_normalization_flags() {
        let message =
            build_run_task_message("session-1", 44_100, "auto", SpeechPreset::Default, None);
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
        assert!(value.pointer("/payload/parameters/vocabulary_id").is_none());
    }

    #[test]
    fn builds_programmer_run_task_message_with_vocabulary_id() {
        let message = build_run_task_message(
            "session-1",
            44_100,
            "zh",
            SpeechPreset::Programmer,
            Some("vocab-user-123"),
        );
        let value: Value =
            serde_json::from_str(&message).expect("programmer run-task payload should be valid json");

        assert_eq!(
            value
                .pointer("/payload/parameters/language_hints")
                .and_then(Value::as_array)
                .map(|items| items.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec!["zh", "en"])
        );
        assert_eq!(
            value
                .pointer("/payload/parameters/vocabulary_id")
                .and_then(Value::as_str),
            Some("vocab-user-123")
        );
    }

    #[test]
    fn programmer_vocabulary_create_payload_targets_realtime_v2() {
        let payload = crate::voice::vocabulary::build_programmer_vocabulary_create_payload("progx-auto");
        assert_eq!(payload["model"].as_str(), Some("speech-biasing"));
        assert_eq!(payload["input"]["action"].as_str(), Some("create_vocabulary"));
        assert_eq!(
            payload["input"]["target_model"].as_str(),
            Some("paraformer-realtime-v2")
        );
    }

    #[test]
    fn programmer_vocabulary_prefix_respects_dashscope_length_limit() {
        let prefix = super::build_programmer_vocabulary_prefix();

        assert!(
            prefix.len() <= 10,
            "expected DashScope vocabulary prefix to stay within 10 chars, got {} ({prefix})",
            prefix.len()
        );
        assert!(prefix.starts_with("praw"));
    }

    #[test]
    fn buffers_early_audio_chunks_in_order_until_the_task_starts() {
        let mut pending = Vec::new();

        super::buffer_pending_audio_chunk(&mut pending, vec![1, 2]);
        super::buffer_pending_audio_chunk(&mut pending, vec![3, 4]);

        assert_eq!(
            super::take_pending_audio_chunks(&mut pending),
            vec![vec![1, 2], vec![3, 4]]
        );
        assert!(pending.is_empty());
    }

    #[test]
    fn drops_oldest_early_audio_when_pending_buffer_reaches_capacity() {
        let mut pending = Vec::new();

        for index in 0..(super::MAX_PENDING_AUDIO_CHUNKS + 2) {
            super::buffer_pending_audio_chunk(&mut pending, vec![index as u8]);
        }

        assert_eq!(pending.len(), super::MAX_PENDING_AUDIO_CHUNKS);
        assert_eq!(pending.first(), Some(&vec![2]));
        assert_eq!(
            pending.last(),
            Some(&vec![(super::MAX_PENDING_AUDIO_CHUNKS as u8) + 1])
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
    fn aggregates_finalized_and_in_progress_transcript_without_dropping_prior_text() {
        let mut finalized_chunks = Vec::new();
        let mut current_chunk = String::new();

        let first = accumulate_transcript_update(&mut finalized_chunks, &mut current_chunk, "你好", true);
        assert_eq!(first, "你好");
        assert_eq!(compose_transcript(&finalized_chunks, Some(current_chunk.as_str())), "你好");

        let second = accumulate_transcript_update(&mut finalized_chunks, &mut current_chunk, "继续说", false);
        assert_eq!(second, "你好继续说");
        assert_eq!(compose_transcript(&finalized_chunks, Some(current_chunk.as_str())), "你好继续说");
    }

    #[test]
    fn inserts_ascii_space_between_finalized_and_current_english_chunks() {
        let mut finalized_chunks = Vec::new();
        let mut current_chunk = String::new();

        let first = accumulate_transcript_update(&mut finalized_chunks, &mut current_chunk, "hello world", true);
        assert_eq!(first, "hello world");

        let second = accumulate_transcript_update(&mut finalized_chunks, &mut current_chunk, "again", false);
        assert_eq!(second, "hello world again");
    }

    #[test]
    fn parses_live_result_generated_event_text() {
        let result = parse_server_event(
            r#"{
                "header": { "task_id": "session-1", "event": "result-generated" },
                "payload": {
                    "output": {
                        "sentence": {
                            "text": "hello partial",
                            "sentence_end": false,
                            "heartbeat": false
                        }
                    }
                }
            }"#,
        )
        .expect("result-generated payload should parse");

        match result {
            ServerMessage::ResultGenerated { text, sentence_end } => {
                assert_eq!(text.as_deref(), Some("hello partial"));
                assert!(!sentence_end);
            }
            other => panic!("expected ResultGenerated, got {other:?}"),
        }
    }

    #[test]
    fn keeps_default_preset_transcript_unchanged() {
        let normalized = super::normalize::normalize_transcript(
            "react 项目",
            super::preset::SpeechPreset::Default,
        );

        assert_eq!(normalized, "react 项目");
    }

    #[test]
    fn normalizes_programmer_terms_and_spaced_commands() {
        let normalized = super::normalize::normalize_transcript(
            "用 typescript 写一个 react hook 然后运行 p n p m dev",
            super::preset::SpeechPreset::Programmer,
        );

        assert_eq!(normalized, "用 TypeScript 写一个 React hook 然后运行 pnpm dev");
    }

    #[test]
    fn normalizes_common_chinese_tool_transliterations() {
        let normalized = super::normalize::normalize_transcript(
            "在陶瑞里面修一下克劳德和扣代克斯",
            super::preset::SpeechPreset::Programmer,
        );

        assert_eq!(normalized, "在 Tauri 里面修一下 Claude 和 Codex");
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
            ServerMessage::ResultGenerated { text, sentence_end } => {
                assert_eq!(text.as_deref(), Some("hello world"));
                assert!(sentence_end);
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
            preset: "default".to_string(),
        };
        validate_start_request(&request).expect("request should be accepted");
        assert_eq!(language_hints("en", SpeechPreset::Default), vec!["en"]);
        assert_eq!(language_hints("zh", SpeechPreset::Programmer), vec!["zh", "en"]);
    }

    #[test]
    fn rejects_invalid_start_request_shape() {
        let invalid_language = StartVoiceTranscriptionRequest {
            provider: "aliyun-paraformer-realtime".to_string(),
            api_key: "secret-key".to_string(),
            language: "ja".to_string(),
            preset: "default".to_string(),
        };
        assert!(validate_start_request(&invalid_language).is_err());

        let invalid_provider = StartVoiceTranscriptionRequest {
            provider: "other".to_string(),
            api_key: "secret-key".to_string(),
            language: "auto".to_string(),
            preset: "default".to_string(),
        };
        assert!(validate_start_request(&invalid_provider).is_err());
    }
}
