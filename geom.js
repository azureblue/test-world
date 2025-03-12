import { Float32Vector2, Float32Vector3, Float32Vector4 } from "./matrixgl/float32vector.js";
import { Matrix3, Matrix4 } from "./matrixgl/matrix.js"

var Vec2 = Float32Vector2;
var Vec4 = Float32Vector4;
var Mat3 = Matrix3;
var Mat4 = Matrix4;

export {
    Float32Vector2 as Vec2, Float32Vector3 as Vec3, Vec4, Mat3, Mat4
}