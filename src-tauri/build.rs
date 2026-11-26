fn main() {
    // A DLL do Everything vem do SDK (o CI baixa). Sem ela, um arquivo vazio deixa
    // o projeto compilar; o app então mostra "DLL do Everything não encontrada".
    let dll = std::path::Path::new("resources").join("Everything64.dll");
    if !dll.exists() {
        let _ = std::fs::create_dir_all("resources");
        let _ = std::fs::write(&dll, []);
    }
    tauri_build::build()
}
