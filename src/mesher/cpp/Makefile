mesher.wasm: uIntWasmMesher.cpp
	clang --target=wasm32 \
	-O3 \
	-ffreestanding -fno-builtin \
	-fno-exceptions -fno-rtti \
	-fno-threadsafe-statics \
	-fno-stack-protector \
	-nostdlib -nostdinc++ \
	-Wl,--import-memory \
	-Wl,--lto-O3 \
	-Wl,--no-entry \
	-Wl,--export-all \
	-Wl,--strip-all \
	uIntWasmMesher.cpp -o mesher.wasm
	