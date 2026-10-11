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
        * vec2<f32>(220.0, 220.0);
    let offset = pixel - vec2<f32>(96.5, 95.0);
    let normalized = offset / vec2<f32>(96.5, 95.0);
    let radiusSquared = dot(normalized, normalized);
    let orbMask = 1.0 - smoothstep(0.9, 1.0, radiusSquared);
    let time = uniforms.time;

    let rim = smoothstep(0.68, 0.94, radiusSquared)
        * (1.0 - smoothstep(0.95, 1.0, radiusSquared));
    let upperGlow = 1.0 - smoothstep(-0.1, 0.8, normalized.y);

    let reflectionX = 96.5 + sin(time * 0.8) * 34.0;
    let reflectionY = 48.0 + cos(time * 0.55) * 6.0;
    let reflectionOffset = pixel - vec2<f32>(reflectionX, reflectionY);
    let broadReflection = exp(
        -(reflectionOffset.x * reflectionOffset.x / 650.0
            + reflectionOffset.y * reflectionOffset.y / 250.0)
    );

    let streakX = 96.5 + sin(time * 0.8) * 42.0;
    let streakY = 47.0 + cos(time * 0.55) * 6.0;
    let streakAxis = (pixel.x - streakX) + (pixel.y - streakY) * 0.42;
    let streak = exp(-streakAxis * streakAxis / 22.0)
        * smoothstep(-74.0, -40.0, offset.x)
        * (1.0 - smoothstep(22.0, 62.0, offset.x));
    let reflection = clamp(broadReflection * 0.38 + streak * 0.86, 0.0, 0.92);

    let alpha = orbMask * (0.06 + upperGlow * 0.08 + rim * 0.2 + reflection * 0.78);
    let glassColor = mix(
        vec3<f32>(0.76, 0.72, 1.0),
        vec3<f32>(1.0, 0.94, 1.0),
        clamp(reflection + rim * 0.4, 0.0, 1.0)
    );
    return vec4<f32>(glassColor * alpha, alpha);
}
