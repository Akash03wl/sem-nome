//! Conversa com o Everything (voidtools) pela DLL oficial do SDK, carregada em tempo de execução.

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use libloading::Library;
use vitra_core::files::{file_hit, FileHit};

type SetSearchW = unsafe extern "system" fn(*const u16);
type SetU32 = unsafe extern "system" fn(u32);
type QueryW = unsafe extern "system" fn(i32) -> i32;
type GetU32 = unsafe extern "system" fn() -> u32;
type IndexBool = unsafe extern "system" fn(u32) -> i32;
type FullPath = unsafe extern "system" fn(u32, *mut u16, u32) -> u32;

const REQUEST_FILE_NAME: u32 = 0x0000_0001;
const REQUEST_PATH: u32 = 0x0000_0002;
/// Mais recentes primeiro: costuma ser o arquivo que a pessoa procura.
const SORT_DATE_MODIFIED_DESCENDING: u32 = 14;
/// Caminhos longos do Windows chegam a 32 767 caracteres.
const MAX_PATH_WIDE: usize = 32_768;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A DLL carregada e as funções que o Vitra usa. O SDK não é thread-safe:
/// quem usa guarda isto atrás de um `Mutex`.
pub struct Everything {
    _lib: Library,
    set_search: SetSearchW,
    set_max: SetU32,
    set_request_flags: SetU32,
    set_sort: Option<SetU32>,
    query: QueryW,
    num_results: GetU32,
    full_path: FullPath,
    is_folder: IndexBool,
    last_error: GetU32,
    major_version: GetU32,
}

impl Everything {
    /// Carrega `Everything64.dll`. `None` se o arquivo não existe ou não é a DLL certa.
    pub fn load(dll_path: &Path) -> Option<Everything> {
        unsafe {
            let lib = Library::new(dll_path).ok()?;
            macro_rules! sym {
                ($name:literal, $ty:ty) => {
                    *lib.get::<$ty>($name).ok()?
                };
            }
            let set_search = sym!(b"Everything_SetSearchW\0", SetSearchW);
            let set_max = sym!(b"Everything_SetMax\0", SetU32);
            let set_request_flags = sym!(b"Everything_SetRequestFlags\0", SetU32);
            let set_sort = lib.get::<SetU32>(b"Everything_SetSort\0").ok().map(|s| *s);
            let query = sym!(b"Everything_QueryW\0", QueryW);
            let num_results = sym!(b"Everything_GetNumResults\0", GetU32);
            let full_path = sym!(b"Everything_GetResultFullPathNameW\0", FullPath);
            let is_folder = sym!(b"Everything_IsFolderResult\0", IndexBool);
            let last_error = sym!(b"Everything_GetLastError\0", GetU32);
            let major_version = sym!(b"Everything_GetMajorVersion\0", GetU32);
            Some(Everything {
                _lib: lib,
                set_search,
                set_max,
                set_request_flags,
                set_sort,
                query,
                num_results,
                full_path,
                is_folder,
                last_error,
                major_version,
            })
        }
    }

    /// `None` se o Everything respondeu; senão, o código de erro do SDK.
    pub fn probe(&self) -> Option<u32> {
        unsafe {
            if (self.major_version)() == 0 {
                Some((self.last_error)())
            } else {
                None
            }
        }
    }

    /// Busca até `max` resultados. Erro = código do SDK (2 = Everything fechado).
    pub fn search(&self, text: &str, max: u32) -> Result<Vec<FileHit>, u32> {
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            (self.set_search)(wide.as_ptr());
            (self.set_max)(max);
            (self.set_request_flags)(REQUEST_FILE_NAME | REQUEST_PATH);
            if let Some(set_sort) = self.set_sort {
                set_sort(SORT_DATE_MODIFIED_DESCENDING);
            }
            if (self.query)(1) == 0 {
                return Err((self.last_error)());
            }
            let n = (self.num_results)();
            let mut buf = vec![0u16; MAX_PATH_WIDE];
            let mut hits = Vec::with_capacity(n as usize);
            for i in 0..n {
                let len = (self.full_path)(i, buf.as_mut_ptr(), buf.len() as u32) as usize;
                if len == 0 {
                    continue;
                }
                let path = String::from_utf16_lossy(&buf[..len.min(buf.len())]);
                hits.push(file_hit(&path, (self.is_folder)(i) != 0));
            }
            Ok(hits)
        }
    }
}

fn exe_candidates() -> Vec<PathBuf> {
    ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"]
        .iter()
        .filter_map(std::env::var_os)
        .map(|dir| PathBuf::from(dir).join("Everything").join("Everything.exe"))
        .collect()
}

/// O `Everything.exe` está instalado no lugar padrão?
pub fn installed() -> bool {
    exe_candidates().iter().any(|p| p.exists())
}

/// Abre o Everything em segundo plano (ícone na bandeja).
pub fn start() -> Result<(), String> {
    let exe = exe_candidates()
        .into_iter()
        .find(|p| p.exists())
        .ok_or("Não encontrei o Everything instalado.")?;
    Command::new(exe)
        .arg("-startup")
        .spawn()
        .map(|_| ())
        .map_err(|_| "Não consegui abrir o Everything.".to_string())
}

/// Instala pelo winget; sem winget, abre a página oficial de downloads.
pub fn install() -> Result<(), String> {
    let ok = Command::new("winget")
        .args([
            "install",
            "--id",
            "voidtools.Everything",
            "-e",
            "--silent",
            "--accept-package-agreements",
            "--accept-source-agreements",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if ok {
        return start();
    }
    super::open("https://www.voidtools.com/downloads/", "", false)
}
