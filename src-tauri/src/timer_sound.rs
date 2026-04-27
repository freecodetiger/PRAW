use std::io::Cursor;
use std::sync::mpsc::{self, Sender};
use std::thread;

use rodio::{Decoder, OutputStream, Sink};

#[derive(Clone, Copy, Debug)]
pub enum TimerCompletionSound {
    Off,
    Asset(&'static [u8]),
}

enum TimerSoundCommand {
    Play(TimerCompletionSound),
}

trait TimerSoundPlaybackHandle {
    fn stop(&self);
}

struct TimerSoundPlaybackSlot<T> {
    active: Option<T>,
}

impl<T> Default for TimerSoundPlaybackSlot<T> {
    fn default() -> Self {
        Self { active: None }
    }
}

impl<T: TimerSoundPlaybackHandle> TimerSoundPlaybackSlot<T> {
    fn replace(&mut self, playback: Option<T>) {
        if let Some(active) = self.active.take() {
            active.stop();
        }

        self.active = playback;
    }
}

struct RodioTimerSoundPlayback {
    _stream: OutputStream,
    sink: Sink,
}

impl RodioTimerSoundPlayback {
    fn new(bytes: &'static [u8]) -> Result<Self, String> {
        let (stream, stream_handle) =
            OutputStream::try_default().map_err(|error| error.to_string())?;
        let sink = Sink::try_new(&stream_handle).map_err(|error| error.to_string())?;
        let source = Decoder::new(Cursor::new(bytes)).map_err(|error| error.to_string())?;
        sink.set_volume(0.42);
        sink.append(source);

        Ok(Self {
            _stream: stream,
            sink,
        })
    }
}

impl TimerSoundPlaybackHandle for RodioTimerSoundPlayback {
    fn stop(&self) {
        self.sink.stop();
    }
}

#[derive(Clone)]
pub struct TimerSoundManager {
    commands: Sender<TimerSoundCommand>,
}

impl Default for TimerSoundManager {
    fn default() -> Self {
        let (sender, receiver) = mpsc::channel();

        thread::spawn(move || {
            let mut slot = TimerSoundPlaybackSlot::default();

            while let Ok(command) = receiver.recv() {
                match command {
                    TimerSoundCommand::Play(TimerCompletionSound::Off) => {
                        slot.replace(None);
                    }
                    TimerSoundCommand::Play(TimerCompletionSound::Asset(bytes)) => {
                        slot.replace(None);

                        match RodioTimerSoundPlayback::new(bytes) {
                            Ok(playback) => slot.replace(Some(playback)),
                            Err(error) => {
                                eprintln!("failed to play timer completion sound: {error}");
                            }
                        }
                    }
                }
            }
        });

        Self { commands: sender }
    }
}

impl TimerSoundManager {
    pub fn play(&self, sound: &str) -> Result<(), String> {
        let sound = resolve_timer_completion_sound(sound)?;

        self.commands
            .send(TimerSoundCommand::Play(sound))
            .map_err(|error| error.to_string())
    }
}

pub fn resolve_timer_completion_sound(sound: &str) -> Result<TimerCompletionSound, String> {
    let asset = match sound {
        "off" => return Ok(TimerCompletionSound::Off),
        "sound1" => include_bytes!("../../src/assets/sounds/sound-1.mp3").as_slice(),
        "sound2" => include_bytes!("../../src/assets/sounds/sound-2.mp3").as_slice(),
        "sound3" => include_bytes!("../../src/assets/sounds/sound-3.mp3").as_slice(),
        "sound4" => include_bytes!("../../src/assets/sounds/sound-4.mp3").as_slice(),
        "sound5" => include_bytes!("../../src/assets/sounds/sound-5.mp3").as_slice(),
        "sound6" => include_bytes!("../../src/assets/sounds/sound-6.mp3").as_slice(),
        "sound7" => include_bytes!("../../src/assets/sounds/sound-7.mp3").as_slice(),
        "sound8" => include_bytes!("../../src/assets/sounds/sound-8.mp3").as_slice(),
        "sound9" => include_bytes!("../../src/assets/sounds/sound-9.mp3").as_slice(),
        "sound10" => include_bytes!("../../src/assets/sounds/sound-10.mp3").as_slice(),
        "sound11" => include_bytes!("../../src/assets/sounds/sound-11.mp3").as_slice(),
        unknown => return Err(format!("unknown timer completion sound: {unknown}")),
    };

    Ok(TimerCompletionSound::Asset(asset))
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    use super::*;

    struct FakePlayback {
        stopped: Arc<AtomicBool>,
    }

    impl TimerSoundPlaybackHandle for FakePlayback {
        fn stop(&self) {
            self.stopped.store(true, Ordering::SeqCst);
        }
    }

    #[test]
    fn replacing_active_timer_sound_stops_previous_playback() {
        let first_stopped = Arc::new(AtomicBool::new(false));
        let second_stopped = Arc::new(AtomicBool::new(false));
        let mut slot = TimerSoundPlaybackSlot::default();

        slot.replace(Some(FakePlayback {
            stopped: first_stopped.clone(),
        }));
        slot.replace(Some(FakePlayback {
            stopped: second_stopped.clone(),
        }));

        assert!(first_stopped.load(Ordering::SeqCst));
        assert!(!second_stopped.load(Ordering::SeqCst));
    }

    #[test]
    fn clearing_active_timer_sound_stops_previous_playback() {
        let stopped = Arc::new(AtomicBool::new(false));
        let mut slot = TimerSoundPlaybackSlot::default();

        slot.replace(Some(FakePlayback {
            stopped: stopped.clone(),
        }));
        slot.replace(None);

        assert!(stopped.load(Ordering::SeqCst));
    }
}
