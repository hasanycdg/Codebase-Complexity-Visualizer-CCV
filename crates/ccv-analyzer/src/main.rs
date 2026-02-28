fn main() {
    if let Err(error) = ccv_analyzer::run_cli(&std::env::args().skip(1).collect::<Vec<_>>()) {
        eprintln!("[ccv] {error}");
        std::process::exit(1);
    }
}
