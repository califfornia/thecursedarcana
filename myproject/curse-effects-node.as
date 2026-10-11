import { Node, Context } from "rive/host";
import {
    GPUBuffer,
    GPUCanvas,
    GPUColorAttachment,
    GPUBindGroup,
    GPUBindGroupUBO,
    GPUColorTargetDesc,
    GPUPassDesc,
    GPUPipeline,
    GPUPipelineDesc,
} from "rive/gpu";
import { BufferUsage, TextureFormat } from "rive/gpu_enums";
import { ImageFilter, ImageSampler, ImageWrap } from "rive/image";
import { Renderer } from "rive/renderer";
import { BlendMode } from "rive/paint";

export class CurseEffects extends Node {
    @input mode: f32 = 0;
    @input centerX: f32 = 640;
    @input centerY: f32 = 635;
    @input strength: f32 = 0;
    canvas: GPUCanvas? = null;
    pipeline: GPUPipeline? = null;
    uniforms: GPUBuffer? = null;
    bindings: GPUBindGroup? = null;
    timeValues: Float32Array? = null;
    elapsed: f32 = 0;
    sampler: ImageSampler = ImageSampler(
        ImageWrap.clamp,
        ImageWrap.clamp,
        ImageFilter.bilinear
    );

    override init(context: Context): bool {
        let shader = context.shader("curse-effects");
        if (shader == null) {
            context.log("Curse effects shader asset was not found.");
            return false;
        }

        let canvas = context.gpuCanvas(1280, 832);
        if (canvas == null) {
            context.log("Curse effects could not create a GPU canvas.");
            return false;
        }

        let colorTarget = new GPUColorTargetDesc();
        colorTarget.format = <TextureFormat>canvas.format;

        let pipelineDesc = new GPUPipelineDesc();
        pipelineDesc.vertexModule = shader;
        pipelineDesc.fragmentModule = shader;
        pipelineDesc.colorTargets = [colorTarget];

        let pipeline = new GPUPipeline(pipelineDesc);
        let values = new Float32Array(8);
        let uniforms = new GPUBuffer(BufferUsage.uniform, 32, values.buffer);
        let bindings = new GPUBindGroup(
            pipeline.getBindGroupLayout(0),
            [new GPUBindGroupUBO(0, uniforms)]
        );

        this.canvas = canvas;
        this.pipeline = pipeline;
        this.uniforms = uniforms;
        this.bindings = bindings;
        this.timeValues = values;
        return true;
    }

    override advance(seconds: f64): bool {
        this.elapsed += <f32>seconds;
        let uniforms = this.uniforms;
        let values = this.timeValues;
        if (uniforms != null && values != null) {
            values[0] = this.elapsed;
            values[1] = this.mode;
            values[2] = this.centerX;
            values[3] = this.centerY;
            values[4] = this.strength;
            uniforms.update(0, values.buffer);
        }
        return true;
    }

    override draw(renderer: Renderer): void {
        let canvas = this.canvas;
        let pipeline = this.pipeline;
        let bindings = this.bindings;
        if (canvas == null || pipeline == null || bindings == null) {
            return;
        }

        let color = new GPUColorAttachment();
        color.clearA = 0;
        let passDesc = new GPUPassDesc();
        passDesc.color = [color];

        let pass = canvas.beginRenderPass(passDesc);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindings);
        pass.draw(3);
        pass.finish();

        renderer.drawImage(canvas.image, this.sampler, BlendMode.screen, 1);
    }
}
