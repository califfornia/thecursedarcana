struct Uniforms {
    time: f32,
    mode: f32,
    centerX: f32,
    centerY: f32,
    strength: f32,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    let p = positions[vertexIndex];
    var output: VertexOutput;
    output.position = vec4<f32>(p, 0.0, 1.0);
    output.uv = p * 0.5 + vec2<f32>(0.5, 0.5);
    return output;
}

fn hash2(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn noise(p: vec2<f32>) -> f32 {
    let cell = floor(p);
    let local = fract(p);
    let blend = local * local * (vec2<f32>(3.0) - 2.0 * local);
    let lower = mix(hash2(cell), hash2(cell + vec2<f32>(1.0, 0.0)), blend.x);
    let upper = mix(hash2(cell + vec2<f32>(0.0, 1.0)), hash2(cell + vec2<f32>(1.0, 1.0)), blend.x);
    return mix(lower, upper, blend.y);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let pixel = vec2<f32>(input.uv.x, 1.0 - input.uv.y) * vec2<f32>(1280.0, 832.0);
    let time = uniforms.time;

    if (uniforms.mode < 0.5) {
        return vec4<f32>(0.0);
    }

    if (uniforms.mode < 1.5) {
        let center = vec2<f32>(640.0, 354.0);
        let offset = (pixel - center) / vec2<f32>(700.0, 450.0);
        let radius = length(offset);
        let haze = noise(pixel * 0.012 + vec2<f32>(time * 0.25, -time * 0.18));
        let alpha = (1.0 - smoothstep(0.28, 1.18, radius))
            * smoothstep(0.08, 0.72, haze) * 0.78;
        let pink = vec3<f32>(0.96, 0.12, 0.48);
        return vec4<f32>(pink * alpha, alpha) * uniforms.strength;
    }

    let frame = floor(time * 24.0);
    let band = fract(pixel.y * 0.018 + frame * 0.173);
    let tear = step(0.88, band) * step(0.12, noise(vec2<f32>(pixel.y * 0.08, frame)));
    let scanline = step(0.96, fract(pixel.y * 0.14 + frame * 0.31));
    let block = step(0.985, fract(pixel.x * 0.016 + frame * 0.23))
        * step(0.35, noise(vec2<f32>(pixel.x * 0.08, frame)));
    let side = step(0.5, fract(pixel.y * 0.019 + frame * 0.41));
    let tint = mix(vec3<f32>(0.2, 0.86, 1.0), vec3<f32>(1.0, 0.18, 0.62), side);
    let alpha = min(0.85, tear * 0.78 + scanline * 0.28 + block * 0.18);
    let flash = vec3<f32>(0.92, 0.1, 0.48) * step(0.94, fract(time * 1.8)) * 0.2;
    return vec4<f32>(tint * alpha + flash, alpha + max(flash.r, flash.g))
        * uniforms.strength;
}
