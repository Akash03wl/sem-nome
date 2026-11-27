//! Lista os apps de `shell:AppsFolder` (Menu Iniciar do usuário, de todos os usuários e Store).

use std::collections::HashSet;

use vitra_core::items::{is_junk, item_id};
use vitra_core::library::ItemKind;
use windows::core::PWSTR;
use windows::Win32::System::Com::{
    CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{
    BHID_EnumItems, FOLDERID_AppsFolder, IEnumShellItems, IShellItem, SHGetKnownFolderItem,
    KF_FLAG_DEFAULT, SIGDN, SIGDN_NORMALDISPLAY, SIGDN_PARENTRELATIVEPARSING,
};

use super::Discovered;

fn display_name(item: &IShellItem, kind: SIGDN) -> Option<String> {
    unsafe {
        let raw: PWSTR = item.GetDisplayName(kind).ok()?;
        let text = raw.to_string().ok();
        CoTaskMemFree(Some(raw.0 as *const _));
        text
    }
}

fn enumerate() -> windows::core::Result<Vec<Discovered>> {
    unsafe {
        let folder: IShellItem = SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None)?;
        let items: IEnumShellItems = folder.BindToHandler(None, &BHID_EnumItems)?;
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        loop {
            let mut batch: [Option<IShellItem>; 1] = [None];
            let mut fetched = 0u32;
            if items.Next(&mut batch, Some(&mut fetched)).is_err() || fetched == 0 {
                break;
            }
            let Some(item) = batch[0].take() else { break };
            let (Some(name), Some(parsing)) = (
                display_name(&item, SIGDN_NORMALDISPLAY),
                display_name(&item, SIGDN_PARENTRELATIVEPARSING),
            ) else {
                continue;
            };
            if name.trim().is_empty() || is_junk(&name) || !seen.insert(name.to_lowercase()) {
                continue;
            }
            let target = format!("shell:AppsFolder\\{parsing}");
            out.push(Discovered { id: item_id(ItemKind::App, &target), name, target });
        }
        out.sort_by_key(|d| d.name.to_lowercase());
        Ok(out)
    }
}

/// Descobre os apps instalados. Roda em qualquer thread (inicializa o COM dela).
pub fn discover() -> Vec<Discovered> {
    unsafe {
        let com = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let result = enumerate().unwrap_or_default();
        if com.is_ok() {
            CoUninitialize();
        }
        result
    }
}
