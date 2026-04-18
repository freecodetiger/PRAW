#[cfg(test)]
mod tests {
    use crate::terminal::shell_integration::{
        build_shell_integration_command, build_shell_integration_script,
        install_shell_integration,
    };
    use portable_pty::{native_pty_system, PtySize};
    use std::io::{Read, Write};
    use std::path::Path;
    use std::{fs, time::SystemTime};
    use std::thread;
    use std::time::Duration;

    fn unique_session_id(label: &str) -> String {
        format!(
            "{label}-{}",
            SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock should be after unix epoch")
                .as_nanos()
        )
    }

    fn create_temp_home(label: &str) -> std::path::PathBuf {
        let home = std::env::temp_dir().join(format!("praw-shell-home-{}", unique_session_id(label)));
        fs::create_dir_all(&home).expect("temp home should create");
        fs::write(home.join(".zshrc"), "").expect("temp zshrc should write");
        fs::write(home.join(".zshenv"), "").expect("temp zshenv should write");
        home
    }

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
        assert!(args.iter().any(|arg| arg == "-l"));
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
        assert!(script.contains("{ source \"$HOME/.bashrc\"; } >/dev/null 2>&1"));
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
        assert!(script.contains("printf '\\033]133;PRAW_AGENT;provider=%s\\a' \"$provider\""));
        assert!(script.contains("__praw_agent_wrapper codex \"$@\""));
    }

    #[test]
    fn zsh_rcfile_contains_prompt_markers_and_sources_zsh_startup_files() {
        let script = build_shell_integration_script("/bin/zsh", "session-1")
            .expect("zsh script should be generated");

        assert!(script.contains("{ source \"$HOME/.zshrc\"; } >/dev/null 2>&1"));
        assert!(script.contains("__praw_saved_vte_version"));
        assert!(script.contains("VTE_VERSION=0"));
        assert!(script.contains("typeset -ga precmd_functions"));
        assert!(script.contains("typeset -ga preexec_functions"));
        assert!(script.contains("precmd_functions+=(__praw_precmd)"));
        assert!(script.contains("preexec_functions+=(__praw_preexec)"));
        assert!(script.contains("PROMPT=$'%{\\033]133;A\\a%}'"));
        assert!(script.contains("printf '\\033]133;C;entry=%s\\a' \"$1\""));
        assert!(script.contains("printf '\\033]133;D;%s\\a' \"$exit_code\""));
        assert!(script.contains("printf '\\033]133;P;cwd=%s\\a' \"$PWD\""));
        assert!(script.contains("printf '\\033]133;PRAW_AGENT;provider=%s\\a' \"$provider\""));
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
        let temp_home = create_temp_home("markers");
        let session_id = unique_session_id("session");
        let mut command = build_shell_integration_command("/bin/zsh", &session_id, "/tmp")
            .expect("zsh integration should be supported");
        let cleanup_paths = install_shell_integration("/bin/zsh", &session_id)
            .expect("zsh integration files should install");
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("HOME", &temp_home);

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
        let _ = std::fs::remove_dir_all(temp_home);

        assert_eq!(status.exit_code(), 0);
        assert!(output.contains("133;A"), "expected prompt-start marker in output: {output:?}");
        assert!(output.contains("133;B"), "expected prompt-end marker in output: {output:?}");
        assert!(output.contains("133;C;entry=pwd"), "expected command-start marker in output: {output:?}");
        assert!(output.contains("133;D;0"), "expected command-end marker in output: {output:?}");
        assert!(
            output.contains(&format!("133;P;cwd={expected_cwd}")),
            "expected cwd marker in output: {output:?}"
        );
        assert!(
            !output.contains("bad math expression"),
            "zsh integration should not emit startup math errors: {output:?}"
        );
    }

    #[test]
    fn zsh_runtime_registers_codex_wrapper_without_startup_errors() {
        if !Path::new("/bin/zsh").exists() {
            return;
        }

        let temp_home = create_temp_home("wrapper");
        let session_id = unique_session_id("session");
        let mut command = build_shell_integration_command("/bin/zsh", &session_id, "/tmp")
            .expect("zsh integration should be supported");
        let cleanup_paths = install_shell_integration("/bin/zsh", &session_id)
            .expect("zsh integration files should install");
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("HOME", &temp_home);
        command.env("PRAW_APP_BIN", "/bin/echo");

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
            .write_all(b"whence -w codex\nexit\n")
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
        let _ = std::fs::remove_dir_all(temp_home);

        assert_eq!(status.exit_code(), 0);
        assert!(output.contains("codex: function"), "expected codex wrapper in output: {output:?}");
        assert!(
            !output.contains("bad math expression"),
            "zsh integration should not emit startup math errors: {output:?}"
        );
    }

    #[test]
    fn zsh_runtime_silences_startup_noise_and_emits_agent_bridge_marker() {
        if !Path::new("/bin/zsh").exists() {
            return;
        }

        let home_dir = std::env::temp_dir().join(format!(
            "praw-zsh-home-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock should be after unix epoch")
                .as_nanos()
        ));
        std::fs::create_dir_all(&home_dir).expect("temp home dir should exist");
        std::fs::write(
            home_dir.join(".zshrc"),
            "echo startup-stdout\nprint -u2 startup-stderr\nfnm env --use-on-cd >/dev/null\n",
        )
        .expect("temp zshrc should write");
        std::fs::write(
            home_dir.join(".zshenv"),
            "echo startup-env-stdout\nprint -u2 startup-env-stderr\n",
        )
        .expect("temp zshenv should write");

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
        command.env("HOME", &home_dir);
        command.env("PRAW_APP_BIN", "/usr/bin/true");

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
            .write_all(b"codex\nexit\n")
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
        let _ = std::fs::remove_dir_all(&home_dir);

        assert_eq!(status.exit_code(), 0);
        assert!(
            !output.contains("startup-stdout")
                && !output.contains("startup-stderr")
                && !output.contains("startup-env-stdout")
                && !output.contains("startup-env-stderr")
                && !output.contains("fnm"),
            "expected shell startup noise to be silenced: {output:?}"
        );
        assert!(
            !output.contains("bad math expression"),
            "expected zsh hook setup to avoid bad math errors: {output:?}"
        );
        assert!(
            output.contains("133;PRAW_AGENT;provider=codex"),
            "expected agent bridge marker in output: {output:?}"
        );
    }

    #[test]
    fn zsh_runtime_loads_login_startup_files_so_gui_bundles_keep_user_path() {
        if !Path::new("/bin/zsh").exists() {
            return;
        }

        let temp_home = create_temp_home("login-path");
        let temp_bin = temp_home.join("bin");
        std::fs::create_dir_all(&temp_bin).expect("temp bin should create");
        std::fs::write(
            temp_bin.join("codex"),
            "#!/bin/sh\necho codex-from-login-path\n",
        )
        .expect("fake codex should write");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = std::fs::metadata(temp_bin.join("codex"))
                .expect("fake codex should stat")
                .permissions();
            permissions.set_mode(0o755);
            std::fs::set_permissions(temp_bin.join("codex"), permissions)
                .expect("fake codex should be executable");
        }
        std::fs::write(
            temp_home.join(".zprofile"),
            format!("export PATH=\"{}:$PATH\"\nexport PRAW_ZPROFILE_MARKER=1\n", temp_bin.display()),
        )
        .expect("temp zprofile should write");
        std::fs::write(temp_home.join(".zlogin"), "export PRAW_ZLOGIN_MARKER=1\n")
            .expect("temp zlogin should write");

        let session_id = unique_session_id("session");
        let mut command = build_shell_integration_command("/bin/zsh", &session_id, "/tmp")
            .expect("zsh integration should be supported");
        let cleanup_paths = install_shell_integration("/bin/zsh", &session_id)
            .expect("zsh integration files should install");
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("HOME", &temp_home);

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
            .write_all(b"printf 'PROFILE=%s LOGIN=%s\\n' \"$PRAW_ZPROFILE_MARKER\" \"$PRAW_ZLOGIN_MARKER\"\nwhence -p codex\nexit\n")
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
        let _ = std::fs::remove_dir_all(&temp_home);

        assert_eq!(status.exit_code(), 0);
        assert!(
            output.contains("PROFILE=1 LOGIN=1"),
            "expected zsh login startup files to load: {output:?}"
        );
        assert!(
            output.contains(temp_bin.join("codex").to_string_lossy().as_ref()),
            "expected login startup PATH to make codex discoverable: {output:?}"
        );
    }
}
