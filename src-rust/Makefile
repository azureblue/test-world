RUSTC_OPTIONS = -C opt-level=3 -C link-arg="--import-memory" --target wasm32-unknown-unknown

../src/mesher.wasm: mesher.rs
	rustc $(RUSTC_OPTIONS) mesher.rs
clean:
	rm -f ../src/mesher.wasm
