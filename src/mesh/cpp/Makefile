all: ../uIntWasmMesher.wasm ../uIntWasmMesherQ.wasm ../light.wasm

headers := int.h blocks.hpp common.hpp quad_encode.hpp row_faces.hpp

../uIntWasmMesher.wasm: uIntWasmMesher.cpp $(headers)
	clang --target=wasm32 \
	-O3 -msimd128 \
	-std=c++20 \
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

../uIntWasmMesherQ.wasm: uIntWasmMesherQ.cpp $(headers)
	clang --target=wasm32 \
	-O3 -msimd128 \
	-std=c++20 \
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

../light.wasm: light.cpp int.h
	clang --target=wasm32 \
	-O3 \
	-std=c++20 \
	-ffreestanding -fno-builtin \
	-fno-exceptions -fno-rtti \
	-fno-threadsafe-statics \
	-fno-stack-protector \
	-nostdlib -nostdinc++ \
	-Wl,--no-entry \
	-Wl,--strip-all \
	light.cpp -o ../light.wasm

clean:
	rm ../uIntWasmMesher.wasm ../uIntWasmMesherQ.wasm ../light.wasm
