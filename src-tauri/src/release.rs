use reqwest::{
    header::{ACCEPT, USER_AGENT},
    Client, Request,
};
use serde::{Deserialize, Serialize};

const LATEST_RELEASE_API_URL: &str = "https://api.github.com/repos/freecodetiger/PRAW/releases/latest";
const LATEST_RELEASE_PAGE_URL: &str = "https://github.com/freecodetiger/PRAW/releases";
const GITHUB_API_ACCEPT: &str = "application/vnd.github+json";
const PRAW_USER_AGENT: &str = concat!("PRAW/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum AppUpdateCheckResult {
    Available {
        current_version: String,
        latest_version: String,
        release_url: String,
    },
    UpToDate {
        current_version: String,
        latest_version: String,
        release_url: String,
    },
    Error {
        current_version: String,
        message: String,
        release_url: String,
    },
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubLatestReleasePayload {
    tag_name: Option<String>,
    html_url: Option<String>,
}

pub async fn check_app_update() -> AppUpdateCheckResult {
    match fetch_latest_release(&Client::new()).await {
        Ok(payload) => build_update_result(payload),
        Err(message) => AppUpdateCheckResult::Error {
            current_version: current_version(),
            message,
            release_url: LATEST_RELEASE_PAGE_URL.to_string(),
        },
    }
}

async fn fetch_latest_release(client: &Client) -> Result<GitHubLatestReleasePayload, String> {
    let response = client
        .execute(build_latest_release_request(client).map_err(|error| error.to_string())?)
        .await
        .map_err(|error| format!("Unable to reach GitHub releases: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(if status.as_u16() == 403 {
            "GitHub temporarily refused the update check. Please try again later or open the download page manually."
                .to_string()
        } else {
            format!("GitHub releases responded with {status}")
        });
    }

    response
        .json::<GitHubLatestReleasePayload>()
        .await
        .map_err(|error| format!("Unable to read the latest release metadata: {error}"))
}

fn build_latest_release_request(client: &Client) -> Result<Request, reqwest::Error> {
    client
        .get(LATEST_RELEASE_API_URL)
        .header(ACCEPT, GITHUB_API_ACCEPT)
        .header(USER_AGENT, PRAW_USER_AGENT)
        .build()
}

fn build_update_result(payload: GitHubLatestReleasePayload) -> AppUpdateCheckResult {
    let current_version = current_version();
    let Some(latest_version) = normalize_release_version(payload.tag_name.as_deref()) else {
        return AppUpdateCheckResult::Error {
            current_version,
            message: "Latest release does not include a valid tag name.".to_string(),
            release_url: LATEST_RELEASE_PAGE_URL.to_string(),
        };
    };
    let release_url = payload
        .html_url
        .filter(|url| !url.trim().is_empty())
        .unwrap_or_else(|| LATEST_RELEASE_PAGE_URL.to_string());

    if is_version_newer(&latest_version, &current_version) {
        AppUpdateCheckResult::Available {
            current_version,
            latest_version,
            release_url,
        }
    } else {
        AppUpdateCheckResult::UpToDate {
            current_version,
            latest_version,
            release_url,
        }
    }
}

fn current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn normalize_release_version(value: Option<&str>) -> Option<String> {
    let normalized = value?.trim().trim_start_matches(['v', 'V']);
    (!normalized.is_empty()).then(|| normalized.to_string())
}

fn is_version_newer(candidate: &str, current: &str) -> bool {
    compare_versions(candidate, current) > 0
}

fn compare_versions(left: &str, right: &str) -> i32 {
    let left_parts = parse_version_parts(left);
    let right_parts = parse_version_parts(right);
    let width = left_parts.len().max(right_parts.len());

    for index in 0..width {
        let diff = left_parts.get(index).unwrap_or(&0) - right_parts.get(index).unwrap_or(&0);
        if diff != 0 {
            return diff;
        }
    }

    0
}

fn parse_version_parts(version: &str) -> Vec<i32> {
    version
        .trim()
        .trim_start_matches(['v', 'V'])
        .split(['.', '-'])
        .filter_map(|part| part.parse::<i32>().ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_multi_digit_release_versions() {
        assert!(is_version_newer("0.1.10", "0.1.5"));
        assert!(!is_version_newer("v0.1.5", "0.1.5"));
        assert!(!is_version_newer("0.1.4", "0.1.5"));
    }

    #[test]
    fn builds_latest_release_request_with_github_headers() {
        let request = build_latest_release_request(&Client::new()).expect("request should build");

        assert_eq!(request.url().as_str(), LATEST_RELEASE_API_URL);
        assert_eq!(
            request.headers().get(ACCEPT).and_then(|value| value.to_str().ok()),
            Some(GITHUB_API_ACCEPT),
        );
        assert_eq!(
            request
                .headers()
                .get(USER_AGENT)
                .and_then(|value| value.to_str().ok()),
            Some(PRAW_USER_AGENT),
        );
    }

    #[test]
    fn builds_available_update_result_from_github_latest_payload() {
        let result = build_update_result(GitHubLatestReleasePayload {
            tag_name: Some("v9.9.9".to_string()),
            html_url: Some("https://github.com/freecodetiger/PRAW/releases/tag/v9.9.9".to_string()),
        });

        assert_eq!(
            result,
            AppUpdateCheckResult::Available {
                current_version: current_version(),
                latest_version: "9.9.9".to_string(),
                release_url: "https://github.com/freecodetiger/PRAW/releases/tag/v9.9.9".to_string(),
            },
        );
    }

    #[test]
    fn serializes_update_result_for_frontend_contract() {
        let value = serde_json::to_value(AppUpdateCheckResult::Available {
            current_version: "0.1.5".to_string(),
            latest_version: "0.1.6".to_string(),
            release_url: "https://github.com/freecodetiger/PRAW/releases/tag/v0.1.6".to_string(),
        })
        .expect("update result should serialize");

        assert_eq!(
            value,
            serde_json::json!({
                "status": "available",
                "currentVersion": "0.1.5",
                "latestVersion": "0.1.6",
                "releaseUrl": "https://github.com/freecodetiger/PRAW/releases/tag/v0.1.6",
            }),
        );
    }

    #[test]
    fn serializes_update_error_with_manual_release_url() {
        let value = serde_json::to_value(AppUpdateCheckResult::Error {
            current_version: "0.1.5".to_string(),
            message: "GitHub API rate limited the release check".to_string(),
            release_url: LATEST_RELEASE_PAGE_URL.to_string(),
        })
        .expect("update error should serialize");

        assert_eq!(
            value,
            serde_json::json!({
                "status": "error",
                "currentVersion": "0.1.5",
                "message": "GitHub API rate limited the release check",
                "releaseUrl": LATEST_RELEASE_PAGE_URL,
            }),
        );
    }

    #[test]
    fn invalid_latest_release_tag_returns_user_facing_error() {
        let result = build_update_result(GitHubLatestReleasePayload {
            tag_name: Some("".to_string()),
            html_url: None,
        });

        assert_eq!(
            result,
            AppUpdateCheckResult::Error {
                current_version: current_version(),
                message: "Latest release does not include a valid tag name.".to_string(),
                release_url: LATEST_RELEASE_PAGE_URL.to_string(),
            },
        );
    }
}
