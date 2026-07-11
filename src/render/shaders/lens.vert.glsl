varying vec2 vUv;

void main() {
  vUv = uv;
  // Full-screen quad: emit clip-space position directly, ignoring the
  // camera's view/projection matrices. The plane's local coordinates
  // already span [-1, 1], which is exactly NDC space.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
