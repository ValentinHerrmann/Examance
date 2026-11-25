;; TeXpresso spike: page hasher for checkpoints (engine.ts embeds the assembled bytes as PAGE_HASH_WASM; rebuild: wabt wat2wasm --enable-simd).
(module
  (import "env" "memory" (memory 0))
  ;; FNV-style hash of one 4 KiB page in four independent SIMD lanes, folded to one i32.
  (func (export "hash") (param $p i32) (result i32)
    (local $i i32) (local $end i32) (local $a v128) (local $b v128) (local $c v128) (local $d v128) (local $k v128)
    (local.set $i (i32.shl (local.get $p) (i32.const 12)))
    (local.set $end (i32.add (local.get $i) (i32.const 4096)))
    (local.set $k (v128.const i32x4 0x01000193 0x01000193 0x01000193 0x01000193))
    (local.set $a (v128.const i32x4 0x811c9dc5 0x811c9dc5 0x811c9dc5 0x811c9dc5))
    (local.set $b (local.get $a)) (local.set $c (local.get $a)) (local.set $d (local.get $a))
    (loop $l
      (local.set $a (i32x4.mul (v128.xor (local.get $a) (v128.load offset=0 (local.get $i))) (local.get $k)))
      (local.set $b (i32x4.mul (v128.xor (local.get $b) (v128.load offset=16 (local.get $i))) (local.get $k)))
      (local.set $c (i32x4.mul (v128.xor (local.get $c) (v128.load offset=32 (local.get $i))) (local.get $k)))
      (local.set $d (i32x4.mul (v128.xor (local.get $d) (v128.load offset=48 (local.get $i))) (local.get $k)))
      (br_if $l (i32.lt_u (local.tee $i (i32.add (local.get $i) (i32.const 64))) (local.get $end))))
    (local.set $a (i32x4.mul (v128.xor (i32x4.mul (v128.xor (i32x4.mul (v128.xor (local.get $a) (local.get $b)) (local.get $k)) (local.get $c)) (local.get $k)) (local.get $d)) (local.get $k)))
    (i32.mul (i32.xor (i32.mul (i32.xor (i32.mul (i32.xor (i32x4.extract_lane 0 (local.get $a)) (i32x4.extract_lane 1 (local.get $a))) (i32.const 0x01000193)) (i32x4.extract_lane 2 (local.get $a))) (i32.const 0x01000193)) (i32x4.extract_lane 3 (local.get $a))) (i32.const 0x01000193))))
