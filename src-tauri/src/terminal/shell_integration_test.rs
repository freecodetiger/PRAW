#[cfg(test)]
mod tests {
    use crate::terminal::shell_integration::{
        build_shell_integration_command, build_shell_integration_script,
        install_shell_integration,
    };
    use portable_pty::{native_pty_system, PtySize};
    use std::io::{Read, Write};
    use std::path::Path;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn bash_shells_are_wrapped_with_a_custom_rcfile() {
        let command = build_shell_integration_command("/bin/bash", "session-1", "/home/zpc")
            .expect("bash integration should be supported");

        let argv = command.get_argv();
        let args: Vec<String> = argv
            .iter()
            .map(|value: &std::ffi::OsString| value.to_string_lossy().into_owned())
            .collect();

        assert_eq!(args[0], "/bin/bash");
        assert!(args.iter().any(|arg| arg == "--rcfile"));
        assert!(args.iter().any(|arg| arg == "-i"));
    }

    #[test]
    fn zsh_shells_are_wrapped_with_a_custom_zdotdir() {
        let command = build_shell_integration_command("/bin/zsh", "session-1", "/home/zpc")
            .expect("zsh integration should be supported");

        let argv = command.get_argv();
        let args: Vec<String> = argv
            .iter()
            .map(|value: &std::ffi::OsString| value.to_string_lossy().into_owned())
            .collect();

        assert_eq!(args[0], "/bin/zsh");
        assert!(!args.iter().any(|arg| arg == "--rcfile"));
        assert!(args.iter().any(|arg| arg == "-i"));

        let zdotdir = command
            .get_env("ZDOTDIR")
            .expect("zsh integration should set ZDOTDIR")
            .to_string_lossy()
            .into_owned();

        assert!(Path::new(&zdotdir).ends_with("session-1.zsh"));
    }

    #[test]
    fn bash_rcfile_contains_prompt_markers_and_sources_bashrc() {
        let script = build_shell_integration_script("/bin/bash", "session-1")
            .expect("bash script should be generated");

        assert!(script.contains("source \"$HOME/.bashrc\""));
        assert!(script.contains("__praw_saved_vte_version"));
        assert!(script.contains("VTE_VERSION=0"));
        assert!(script.contains("PS0="));
        assert!(script.contains("133;A"));
        assert!(script.contains("133;B"));
        assert!(script.contains("133;C"));
        assert!(script.contains("133;D;"));
        assert!(script.contains("133;P;cwd="));
        assert!(script.contains("__praw_prompt_ready"));
        assert!(script.contains("__praw_emit_command_start"));
        assert!(script.contains("entry="));
        assert!(script.contains("printf '\\033]133;C;entry=%s\\a' \"$command\""));
        assert!(script.contains("function codex()"));
        assert!(script.contains("function claude()"));
        assert!(script.contains("function qwen()"));
        assert!(script.contains("__praw_agent_wrapper codex \"$@\""));
    }

    #[test]
    fn zsh_rcfile_contains_prompt_markers_and_sources_zsh_startup_files() {
        let script = build_shell_integration_script("/bin/zsh", "session-1")
            .expect("zsh script should be generated");

        assert!(script.contains("source \"$HOME/.zshrc\""));
        assert!(script.contains("__praw_saved_vte_version"));
        assert!(script.contains("VTE_VERSION=0"));
        assert!(script.contains("precmd_functions+=(__praw_precmd)"));
        assert!(script.contains("preexec_functions+=(__praw_preexec)"));
        assert!(script.contains("PROMPT=$'%{\\033]133;A\\a%}'"));
        assert!(script.contains("printf '\\033]133;C;entry=%s\\a' \"$1\""));
        assert!(script.contains("printf '\\033]133;D;%s\\a' \"$exit_code\""));
        assert!(script.contains("printf '\\033]133;P;cwd=%s\\a' \"$PWD\""));
        assert!(script.contains("function codex()"));
        assert!(script.contains("function claude()"));
        assert!(script.contains("function qwen()"));
    }

    #[test]
    fn unsupported_shells_are_not_wrapped() {
        assert!(build_shell_integration_command("/opt/homebrew/bin/fish", "session-1", "/home/zpc").is_none());
        assert!(build_shell_integration_script("/opt/homebrew/bin/fish", "session-1").is_none());
    }

    #[test]
    fn zsh_runtime_emits_shell_markers_for_real_commands() {
        if !Path::new("/bin/zsh").exists() {
            return;
        }

        let expected_cwd = std::fs::canonicalize("/tmp")
            .expect("/tmp should resolve")
            .to_string_lossy()
            .into_owned();
        let session_id = format!(
            "session-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock should be after unix epoch")
                .as_nanos()
        );
        let mut command = build_shell_integration_command("/bin/zsh", &session_id, "/tmp")
            .expect("zsh integration should be supported");
        let cleanup_paths = install_shell_integration("/bin/zsh", &session_id)
            .expect("zsh integration files should install");
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");

        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("pty should open");

        let mut child = pair
            .slave
            .spawn_command(command)
            .expect("zsh should spawn in pty");
        drop(pair.slave);

        let mut writer = pair.master.take_writer().expect("writer should be available");
        let mut reader = pair
            .master
            .try_clone_reader()
            .expect("reader should be cloneable");

        let read_handle = thread::spawn(move || {
            let mut buffer = [0_u8; 4096];
            let mut output = Vec::new();
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(read) => output.extend_from_slice(&buffer[..read]),
                    Err(_) => break,
                }
            }
            String::from_utf8_lossy(&output).into_owned()
        });

        thread::sleep(Duration::from_millis(250));
        writer
            .write_all(b"pwd\nexit\n")
            .expect("commands should write to zsh");
        writer.flush().expect("commands should flush");
        drop(writer);

        let status = child.wait().expect("zsh should exit cleanly");
        let output = read_handle.join().expect("reader thread should join");

        for path in cleanup_paths {
            if path.is_dir() {
                let _ = std::fs::remove_dir_all(path);
            } else {
                let _ = std::fs::remove_file(path);
            }
        }

        assert_eq!(status.exit_code(), 0);
        assert!(output.contains("133;A"), "expected prompt-start marker in output: {output:?}");
        assert!(output.contains("133;B"), "expected prompt-end marker in output: {output:?}");
        assert!(output.contains("133;C;entry=pwd"), "expected command-start marker in output: {output:?}");
        assert!(output.contains("133;D;0"), "expected command-end marker in output: {output:?}");
        assert!(
            output.contains(&format!("133;P;cwd={expected_cwd}")),
            "expected cwd marker in output: {output:?}"
        );
    }
}
