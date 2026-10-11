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

fn hash2(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn valueNoise(p: vec2<f32>) -> f32 {
    let cell = floor(p);
    let local = fract(p);
    let blend = local * local * (vec2<f32>(3.0, 3.0) - 2.0 * local);

    let bottom = mix(
        hash2(cell),
        hash2(cell + vec2<f32>(1.0, 0.0)),
        blend.x
    );
    let top = mix(
        hash2(cell + vec2<f32>(0.0, 1.0)),
        hash2(cell + vec2<f32>(1.0, 1.0)),
        blend.x
    );
    return mix(bottom, top, blend.y);
}

fn cloudNoise(p: vec2<f32>) -> f32 {
    let broad = valueNoise(p);
    let detail = valueNoise(p * 2.0 + vec2<f32>(13.4, 7.1));
    return broad * 0.72 + detail * 0.28;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
    let pixel = uv * vec2<f32>(372.0, 658.0);
    let centerX = 186.0;
    let springY = 168.0;
    let roofHeight = 158.0;
    var halfWidth = 172.0;

    if (pixel.y < springY) {
        let roofPosition = (pixel.y - springY) / roofHeight;
        halfWidth = 172.0 * sqrt(max(0.0, 1.0 - roofPosition * roofPosition));
    }

    let leftEdge = centerX - halfWidth;
    let rightEdge = centerX + halfWidth;
    let horizontalMask = smoothstep(0.0, 5.0, min(pixel.x - leftEdge, rightEdge - pixel.x));
    let roofMask = smoothstep(7.0, 12.0, pixel.y);
    let windowMask = horizontalMask * roofMask;

    let time = uniforms.time;
    let wind = time * 0.34;
    let cloudWarp = sin(uv.y * 9.0 + time * 0.24) * 0.16;
    let broadClouds = cloudNoise(
        uv * vec2<f32>(3.6, 5.5) - vec2<f32>(wind, time * 0.025)
            + vec2<f32>(cloudWarp, 0.0)
    );
    let fineClouds = cloudNoise(
        uv * vec2<f32>(7.2, 10.0) - vec2<f32>(wind * 0.62, time * 0.04)
    );
    let cloudBands = broadClouds * 0.7 + fineClouds * 0.3
        + sin(uv.y * 20.0 + uv.x * 3.0 - time * 0.72) * 0.055;
    let cloudAlpha = smoothstep(0.4, 0.61, cloudBands) * 0.48;

    let mistPosition = uv * vec2<f32>(2.4, 5.0)
        - vec2<f32>(wind * 0.48, -time * 0.018);
    let mist = cloudNoise(mistPosition);
    let mistAlpha = smoothstep(0.4, 0.72, mist)
        * smoothstep(0.2, 0.9, uv.y) * 0.27;

    var starGlow = 0.0;
    if (pixel.y < 260.0) {
        let stars = array<vec2<f32>, 7>(
            vec2<f32>(207.5, 53.3),
            vec2<f32>(165.5, 97.3),
            vec2<f32>(297.5, 108.8),
            vec2<f32>(78.5, 135.8),
            vec2<f32>(341.5, 192.8),
            vec2<f32>(54.0, 221.8),
            vec2<f32>(302.5, 232.8)
        );
        for (var i = 0u; i < 7u; i = i + 1u) {
            let distance = pixel - stars[i];
            let phase = fract(time / 8.0) * 8.0 - f32(i);
            let pulse = smoothstep(0.0, 0.16, phase)
                * (1.0 - smoothstep(0.76, 1.0, phase));
            let radius = exp(-dot(distance, distance) * 0.0012);
            let horizontalRay = exp(-abs(distance.y) * 0.11 - abs(distance.x) * 0.018);
            let verticalRay = exp(-abs(distance.x) * 0.11 - abs(distance.y) * 0.018);
            let glint = pulse * (radius * 0.82 + horizontalRay * 0.68 + verticalRay * 0.68);
            starGlow = max(starGlow, glint);
        }
    }
    starGlow = min(starGlow, 0.9) * windowMask;

    let cloudAndMistAlpha = cloudAlpha + mistAlpha * (1.0 - cloudAlpha);
    let alpha = starGlow + cloudAndMistAlpha * (1.0 - starGlow) * windowMask;
    let cloudColor = vec3<f32>(0.86, 0.82, 1.0);
    let mistColor = vec3<f32>(0.88, 0.82, 0.98);
    let cloudAndMistColor =
        cloudColor * cloudAlpha + mistColor * mistAlpha * (1.0 - cloudAlpha);
    let glowColor = vec3<f32>(0.98, 0.94, 1.0);
    let color = (
        glowColor * starGlow
        + cloudAndMistColor * (1.0 - starGlow)
    ) * windowMask;
    return vec4<f32>(color, alpha);
}
