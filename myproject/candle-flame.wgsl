struct Uniforms {
    time: f32,
    pad0: f32,
    pad1: f32,
    pad2: f32,
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

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let pixel = vec2<f32>(input.uv.x, 1.0 - input.uv.y)
        * vec2<f32>(145.0, 100.0);
    let time = uniforms.time;
    let height = clamp((77.0 - pixel.y) / 77.0, 0.0, 1.0);
    let sway = sin(time * 5.1 + height * 2.4) * 1.2
        + sin(time * 8.3 + height * 4.0) * 0.55;
    let flameCenter = 70.0 + sway * height;
    let halfWidth = 31.0 * pow(height, 0.55) * pow(1.0 - height, 1.0);
    let distanceX = abs(pixel.x - flameCenter);
    let flame = (1.0 - smoothstep(halfWidth - 1.3, halfWidth + 1.3, distanceX))
        * smoothstep(1.0, 5.0, pixel.y)
        * (1.0 - smoothstep(73.0, 78.0, pixel.y));
    let coreWidth = halfWidth * 0.36;
    let core = (1.0 - smoothstep(coreWidth - 1.0, coreWidth + 1.2, distanceX))
        * flame;
    let glowDistance = pixel - vec2<f32>(flameCenter, 50.0);
    let glow = exp(
        -(glowDistance.x * glowDistance.x / 460.0
            + glowDistance.y * glowDistance.y / 980.0)
    ) * 0.24;

    let alpha = clamp(glow + flame * 0.16 + core * 0.18, 0.0, 0.42);
    let bodyColor = vec3<f32>(1.0, 0.37, 0.08);
    let coreColor = vec3<f32>(1.0, 0.83, 0.39);
    let color = mix(bodyColor, coreColor, core * 0.8);
    return vec4<f32>(color * alpha, alpha);
}
