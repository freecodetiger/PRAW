#[cfg(test)]
mod tests {
    use crate::terminal::shell_integration::{
        build_shell_integration_command, build_shell_integration_rcfile,
    };

    #[test]
    fn bash_shells_are_wrapped_with_a_custom_rcfile() {
        let command = build_shell_integration_command(
            "/bin/bash",
            "session-1",
            "/home/zpc",
        )
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
    fn rcfile_contains_prompt_markers_and_sources_bashrc() {
        let script = build_shell_integration_rcfile("session-1");

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
    }
}
