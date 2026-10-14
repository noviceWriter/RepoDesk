//! Pull Request ve Issue işlemleri (`gh pr` / `gh issue`).

use serde::{Deserialize, Serialize};

use crate::arka_plan;
use crate::github::sahip_repo;
use crate::komut::{calistir, gh, git};
use crate::yerel::{durum_oku, git_hata_acikla};
use crate::yol::kok_dizin;

const PR_ALANLARI: &str = "number,title,author,createdAt,updatedAt,url,state,isDraft,headRefName,baseRefName,labels,reviewDecision";
const ISSUE_ALANLARI: &str = "number,title,author,createdAt,updatedAt,url,state,labels";

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct GhIstek {
    number: u64,
    title: String,
    author: Option<GhYazar>,
    created_at: String,
    updated_at: String,
    url: String,
    state: String,
    is_draft: bool,
    head_ref_name: Option<String>,
    base_ref_name: Option<String>,
    labels: Vec<GhEtiket>,
    review_decision: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct GhYazar {
    login: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct GhEtiket {
    name: String,
    color: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Istek {
    numara: u64,
    baslik: String,
    yazar: String,
    olusturma: String,
    guncelleme: String,
    url: String,
    durum: String,
    taslak: bool,
    kaynak_dal: Option<String>,
    hedef_dal: Option<String>,
    etiketler: Vec<Etiket>,
    inceleme: Option<String>,
}

#[derive(Serialize)]
pub struct Etiket {
    ad: String,
    renk: String,
}

impl From<GhIstek> for Istek {
    fn from(g: GhIstek) -> Self {
        Istek {
            numara: g.number,
            baslik: g.title,
            yazar: g.author.map(|a| a.login).unwrap_or_default(),
            olusturma: g.created_at,
            guncelleme: g.updated_at,
            url: g.url,
            durum: g.state.to_lowercase(),
            taslak: g.is_draft,
            kaynak_dal: g.head_ref_name,
            hedef_dal: g.base_ref_name,
            etiketler: g.labels.into_iter().map(|e| Etiket { ad: e.name, renk: e.color }).collect(),
            inceleme: g.review_decision.filter(|r| !r.is_empty()),
        }
    }
}

fn numara_metni(numara: u64) -> Result<String, String> {
    if numara == 0 { Err("Geçersiz numara.".into()) } else { Ok(numara.to_string()) }
}

fn baslik_dogrula(baslik: &str) -> Result<&str, String> {
    let baslik = baslik.trim();
    if baslik.is_empty() { Err("Başlık gerekli.".into()) } else { Ok(baslik) }
}

#[tauri::command]
pub async fn istek_listele(repo: String, tur: String, durum: String) -> Result<Vec<Istek>, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        let (komut, alanlar) = match tur.as_str() {
            "pr" => ("pr", PR_ALANLARI),
            "issue" => ("issue", ISSUE_ALANLARI),
            _ => return Err("Geçersiz liste türü.".into()),
        };
        let gecerli = if tur == "pr" { &["open", "closed", "merged", "all"][..] } else { &["open", "closed", "all"][..] };
        if !gecerli.contains(&durum.as_str()) {
            return Err("Geçersiz durum filtresi.".into());
        }
        let cikti = gh(&[komut, "list", "--repo", &tam_ad, "--state", &durum, "--limit", "100", "--json", alanlar])?;
        if !cikti.basarili && cikti.hata().contains("has disabled issues") {
            return Err("Bu repoda Issue özelliği kapalı. GitHub'da repo ayarlarından açabilirsin.".into());
        }
        let liste: Vec<GhIstek> =
            serde_json::from_str(&cikti.tamam()?.stdout).map_err(|e| format!("Liste okunamadı: {e}"))?;
        Ok(liste.into_iter().map(Istek::from).collect())
    })
    .await
}

#[tauri::command]
pub async fn varsayilan_dal(repo: String) -> Result<String, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        let cikti = gh(&["repo", "view", &tam_ad, "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"])?.tamam()?;
        Ok(cikti.stdout.trim().to_string())
    })
    .await
}

#[tauri::command]
pub async fn issue_olustur(repo: String, baslik: String, govde: String) -> Result<String, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        let baslik = baslik_dogrula(&baslik)?;
        let cikti = gh(&["issue", "create", "--repo", &tam_ad, "--title", baslik, "--body", govde.trim()])?.tamam()?;
        Ok(cikti.stdout.trim().lines().last().unwrap_or_default().to_string())
    })
    .await
}

#[tauri::command]
pub async fn issue_durum_degistir(repo: String, numara: u64, kapat: bool) -> Result<String, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        let n = numara_metni(numara)?;
        gh(&["issue", if kapat { "close" } else { "reopen" }, &n, "--repo", &tam_ad])?.tamam()?;
        Ok(format!("#{n} {}.", if kapat { "kapatıldı" } else { "yeniden açıldı" }))
    })
    .await
}

/// Geçerli daldan PR açar; dal GitHub'da yoksa ya da yeni commit'leri varsa önce push eder.
#[tauri::command]
pub async fn pr_olustur(kok: String, baslik: String, govde: String, hedef: String, taslak: bool) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let baslik = baslik_dogrula(&baslik)?;
        let hedef = hedef.trim();
        let durum = durum_oku(&kok)?;
        let Some(dal) = durum.dal.clone() else {
            return Err("PR açmak için bir dalda olmalısın.".into());
        };
        if durum.origin.is_none() {
            return Err("Klasör bir GitHub reposuna bağlı değil.".into());
        }
        if hedef.is_empty() || hedef.starts_with('-') {
            return Err("Hedef dal gerekli.".into());
        }
        if dal == hedef {
            return Err(format!("PR, '{hedef}' dalının kendisinden açılamaz. Önce yeni bir dal oluşturup değişikliklerini orada commit et."));
        }
        if !durum.commit_var {
            return Err("Henüz commit yok.".into());
        }
        if durum.upstream.is_none() || durum.upstream_silindi || durum.ileri > 0 {
            git(&kok, &["push", "-u", "origin", "HEAD"]).and_then(|c| c.tamam()).map_err(git_hata_acikla)?;
        }
        let mut args = vec!["pr", "create", "--title", baslik, "--body", govde.trim(), "--base", hedef, "--head", dal.as_str()];
        if taslak {
            args.push("--draft");
        }
        let cikti = calistir("gh", &args, Some(&kok))?;
        if !cikti.basarili && cikti.hata().contains("already exists") {
            return Err(format!("'{dal}' dalı için zaten açık bir PR var.\n\n{}", cikti.hata()));
        }
        if !cikti.basarili && cikti.hata().contains("No commits between") {
            return Err(format!("'{dal}' dalında '{hedef}' dalına göre yeni commit yok."));
        }
        Ok(cikti.tamam()?.stdout.trim().lines().last().unwrap_or_default().to_string())
    })
    .await
}

#[tauri::command]
pub async fn pr_birlestir(repo: String, numara: u64, yontem: String, dal_sil: bool) -> Result<String, String> {
    arka_plan(move || {
        let tam_ad = sahip_repo(&repo)?;
        let n = numara_metni(numara)?;
        let bayrak = match yontem.as_str() {
            "merge" => "--merge",
            "squash" => "--squash",
            "rebase" => "--rebase",
            _ => return Err("Geçersiz birleştirme yöntemi.".into()),
        };
        let mut args = vec!["pr", "merge", n.as_str(), "--repo", tam_ad.as_str(), bayrak];
        if dal_sil {
            args.push("--delete-branch");
        }
        gh(&args)?.tamam()?;
        Ok(format!("PR #{n} birleştirildi."))
    })
    .await
}

#[tauri::command]
pub async fn pr_yerelde_ac(kok: String, numara: u64) -> Result<String, String> {
    arka_plan(move || {
        let kok = kok_dizin(&kok)?;
        let n = numara_metni(numara)?;
        calistir("gh", &["pr", "checkout", &n], Some(&kok))?.tamam().map_err(git_hata_acikla)?;
        Ok(format!("PR #{n} dalına geçildi; değişiklikleri yerelde inceleyebilirsin."))
    })
    .await
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn gh_ciktisi_donusturulur() {
        let json = r#"[{"number":7,"title":"Dal ekle","author":{"login":"ahmet"},"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z","url":"https://github.com/a/b/pull/7","state":"OPEN","isDraft":true,"headRefName":"ozellik","baseRefName":"main","labels":[{"name":"bug","color":"d73a4a"}],"reviewDecision":""}]"#;
        let liste: Vec<GhIstek> = serde_json::from_str(json).unwrap();
        let i = Istek::from(liste.into_iter().next().unwrap());
        assert_eq!((i.numara, i.durum.as_str(), i.taslak), (7, "open", true));
        assert_eq!(i.etiketler[0].renk, "d73a4a");
        assert_eq!(i.inceleme, None);
        let issue: Vec<GhIstek> = serde_json::from_str(r#"[{"number":1,"title":"x","state":"CLOSED"}]"#).unwrap();
        assert_eq!(Istek::from(issue.into_iter().next().unwrap()).yazar, "");
    }
}
