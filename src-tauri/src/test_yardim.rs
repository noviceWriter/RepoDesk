//! Test yardımcıları.

use std::path::PathBuf;

/// Kapsamdan çıkınca (test panik verse bile) klasörü silen bekçi.
pub struct Temizlik(pub PathBuf);

impl Drop for Temizlik {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
