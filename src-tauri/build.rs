fn main() {
    // A DLL do Everything vem do SDK (o CI baixa). Sem ela, um arquivo vazio deixa
    // o projeto compilar; o app então mostra "DLL do Everything não encontrada".
    let dll = std::path::Path::new("resources").join("Everything64.dll");
    if !dll.exists() {
        let _ = std::fs::create_dir_all("resources");
        let _ = std::fs::write(&dll, []);
    }
    let lic = std::path::Path::new("resources").join("Everything-SDK-LICENSE.txt");
    if !lic.exists() {
        let _ = std::fs::write(&lic, "Everything SDK (c) voidtools - https://www.voidtools.com/support/everything/sdk/\n");
    }
    tauri_build::build()
}
