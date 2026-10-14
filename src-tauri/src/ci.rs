//! GitHub Actions / CI durumu.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::arka_plan;
use crate::github::sahip_repo;
use crate::komut::gh;

const OZET_SORGUSU: &str = r#"query($sonra: String) {
  viewer {
    repositories(first: 100, after: $sonra, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        nameWithOwner
        defaultBranchRef { target { ... on Commit { statusCheckRollup { state } } } }
      }
    }
  }
}"#;

const CALISMA_ALANLARI: &str = "databaseId,displayTitle,status,conclusion,workflowName,url,createdAt,headBranch,event";

#[derive(Deserialize)]
struct Yanit {
    data: Veri,
}

#[derive(Deserialize)]
struct Veri {
    viewer: Izleyici,
}

#[derive(Deserialize)]
struct Izleyici {
    repositories: Depolar,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Depolar {
    page_info: SayfaBilgisi,
    nodes: Vec<Dugum>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SayfaBilgisi {
    has_next_page: bool,
    end_cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Dugum {
    name_with_owner: String,
    default_branch_ref: Option<DalRef>,
}

#[derive(Deserialize)]
struct DalRef {
    target: Option<Hedef>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Hedef {
    status_check_rollup: Option<Toplam>,
}

#[derive(Deserialize)]
struct Toplam {
    state: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct GhCalisma {
    database_id: u64,
    display_title: String,
    status: String,
    conclusion: String,
    workflow_name: String,
    url: String,
    created_at: String,
    head_branch: String,
    event: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Calisma {
    id: u64,
    baslik: String,
    /// basarili | basarisiz | suruyor | iptal | atlandi | bilinmiyor
    durum: &'static str,
    is_akisi: String,
    url: String,
    tarih: String,
    dal: String,
    olay: String,
}

/// GitHub'ın status/conclusion değerlerini sade bir duruma indirger.
fn durum_esle(status: &str, conclusion: &str) -> &'static str {
    if status != "completed" {
        return "suruyor";
    }
    match conclusion {
        "success" => "basarili",
        "failure" | "timed_out" | "startup_failure" | "action_required" => "basarisiz",
        "cancelled" => "iptal",
        "skipped" | "neutral" | "stale" => "atlandi",
        _ => "bilinmiyor",
    }
}

/// statusCheckRollup.state → sade durum
fn ozet_esle(state: &str) -> &'static str {
    match state {
        "SUCCESS" => "basarili",
        "FAILURE" | "ERROR" => "basarisiz",
        "PENDING" | "EXPECTED" => "suruyor",
        _ => "bilinmiyor",
    }
}

/// Bir sayfadaki (repo, durum) çiftleri ve varsa sonraki sayfanın imleci.
type Sayfa = (Vec<(String, &'static str)>, Option<String>);

fn sayfa_ayristir(json: &str) -> Result<Sayfa, String> {
    let yanit: Yanit = serde_json::from_str(json).map_err(|e| format!("CI durumu okunamadı: {e}"))?;
    let depolar = yanit.data.viewer.repositories;
    let durumlar = depolar
        .nodes
        .into_iter()
        .filter_map(|d| {
            let durum = d.default_branch_ref?.target?.status_check_rollup?.state;
            Some((d.name_with_owner.to_lowercase(), ozet_esle(&durum)))
        })
        .collect();
    let sonraki = depolar.page_info.has_next_page.then_some(depolar.page_info.end_cursor).flatten();
    Ok((durumlar, sonraki))
}

/// Tüm repoların varsayılan dalındaki son CI durumu: `sahip/repo` (küçük harf) → durum.
#[tauri::command]
pub async fn ci_ozetleri() -> Result<HashMap<String, &'static str>, String> {
    arka_plan(|| {
        let mut sonuc = HashMap::new();
        let mut imlec: Option<String> = None;
        for _ in 0..10 {
            let sorgu = format!("query={OZET_SORGUSU}");
            let mut args = vec!["api", "graphql", "-f", sorgu.as_str()];
            let imlec_arg = imlec.as_ref().map(|i| format!("sonra={i}"));
            if let Some(a) = imlec_arg.as_deref() {
                args.extend(["-f", a]);
            }
            let (durumlar, sonraki) = sayfa_ayristir(&gh(&args)?.tamam()?.stdout)?;
            sonuc.extend(durumlar);
            match sonraki {
                Some(s) => imlec = Some(s),
                None => break,
            }
        }
        Ok(sonuc)
    })
    .await
}

#[tauri::command]
pub async fn ci_calismalari(repo: String, dal: Option<String>) -> Result<Vec<Calisma>, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        let mut args = vec!["run", "list", "--repo", tam_ad.as_str(), "--limit", "20", "--json", CALISMA_ALANLARI];
        if let Some(d) = dal.as_deref().filter(|d| !d.is_empty() && !d.starts_with('-')) {
            args.extend(["--branch", d]);
        }
        let cikti = gh(&args)?;
        if !cikti.basarili && cikti.hata().contains("disabled") {
            return Err("Bu repoda GitHub Actions kapalı.".into());
        }
        let liste: Vec<GhCalisma> = serde_json::from_str(&cikti.tamam()?.stdout).map_err(|e| format!("Çalıştırma listesi okunamadı: {e}"))?;
        Ok(liste
            .into_iter()
            .map(|c| Calisma {
                id: c.database_id,
                durum: durum_esle(&c.status, &c.conclusion),
                baslik: c.display_title,
                is_akisi: c.workflow_name,
                url: c.url,
                tarih: c.created_at,
                dal: c.head_branch,
                olay: c.event,
            })
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn ci_yeniden_calistir(repo: String, id: u64, sadece_basarisiz: bool) -> Result<String, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        if id == 0 {
            return Err("Geçersiz çalıştırma.".into());
        }
        let id = id.to_string();
        let mut args = vec!["run", "rerun", id.as_str(), "--repo", tam_ad.as_str()];
        if sadece_basarisiz {
            args.push("--failed");
        }
        gh(&args)?.tamam()?;
        Ok("Çalıştırma yeniden başlatıldı.".into())
    })
    .await
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn durumlar_eslenir() {
        assert_eq!(durum_esle("in_progress", ""), "suruyor");
        assert_eq!(durum_esle("completed", "success"), "basarili");
        assert_eq!(durum_esle("completed", "timed_out"), "basarisiz");
        assert_eq!(durum_esle("completed", "cancelled"), "iptal");
        assert_eq!(ozet_esle("EXPECTED"), "suruyor");
    }

    #[test]
    fn graphql_sayfasi_cozulur() {
        let json = r#"{"data":{"viewer":{"repositories":{"pageInfo":{"hasNextPage":true,"endCursor":"abc"},"nodes":[
            {"nameWithOwner":"Ahmet/Proje","defaultBranchRef":{"target":{"statusCheckRollup":{"state":"FAILURE"}}}},
            {"nameWithOwner":"ahmet/bos","defaultBranchRef":null},
            {"nameWithOwner":"ahmet/cisiz","defaultBranchRef":{"target":{"statusCheckRollup":null}}}]}}}}"#;
        let (d, sonraki) = sayfa_ayristir(json).unwrap();
        assert_eq!(d, vec![("ahmet/proje".to_string(), "basarisiz")]);
        assert_eq!(sonraki.as_deref(), Some("abc"));
    }

    /// Gerçek GitHub hesabıyla yalnızca okuma yapar: `cargo test -- --ignored ci_canli`
    #[test]
    #[ignore]
    fn ci_canli() {
        let ozet = tauri::async_runtime::block_on(ci_ozetleri()).unwrap();
        println!("CI özetli repo sayısı: {}", ozet.len());
        // Durum başka servislerden (Vercel vb.) de gelebilir; Actions çalıştırması olan ilk repoyu bul.
        let bulunan = ozet.keys().find_map(|repo| {
            let liste = tauri::async_runtime::block_on(ci_calismalari(format!("https://github.com/{repo}"), None)).ok()?;
            (!liste.is_empty()).then(|| (repo.clone(), liste))
        });
        let (repo, liste) = bulunan.expect("Actions çalıştırması olan repo yok");
        println!("{repo}: {} çalıştırma, ilk: {} / {}", liste.len(), liste[0].durum, liste[0].is_akisi);
    }
}
