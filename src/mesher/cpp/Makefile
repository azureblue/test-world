all: ../uIntWasmMesher.wasm ../uIntWasmMesherQ.wasm

../uIntWasmMesher.wasm: uIntWasmMesher.cpp
	clang --target=wasm32 \
	-O3 \
	-ffreestanding -fno-builtin \
	-fno-exceptions -fno-rtti \
	-fno-threadsafe-statics \
	-fno-stack-protector \
	-nostdlib -nostdinc++ \
	-Wl,--import-memory \
	-Wl,--export=create_mesh \
	-Wl,--export=__heap_base \
	-Wl,--no-entry \
	-Wl,--strip-all \
	uIntWasmMesher.cpp -o ../uIntWasmMesher.wasm

../uIntWasmMesherQ.wasm: uIntWasmMesherQ.cpp
	clang --target=wasm32 \
	-O3 \
	-ffreestanding -fno-builtin \
	-fno-exceptions -fno-rtti \
	-fno-threadsafe-statics \
	-fno-stack-protector \
	-nostdlib -nostdinc++ \
	-Wl,--import-memory \
	-Wl,--export=create_mesh \
	-Wl,--export=__heap_base \
	-Wl,--no-entry \
	-Wl,--strip-all \
	uIntWasmMesherQ.cpp -o ../uIntWasmMesherQ.wasm
	