import { mat4, vec3 } from "gl-matrix";
import { GLDirectionalLight, GLModel, GLRenderer, GLScene, GLSceneObject, Shader } from "./webgl-framework";

// Global Variables
let gl : WebGL2RenderingContext;
let renderer : GLRenderer;
let model: GLModel;

const options : XRSessionInit = {
    requiredFeatures: ['unbounded']
}

let viewerRefSpace : XRReferenceSpace;
let localRefSpace : XRReferenceSpace;
let unboundedRefSpace: XRReferenceSpace;

async function main() {
    await setupRenderer();

    // Load the model 
    model = await renderer.loadModelData('models/yoshikage_kira/scene.gltf');

    // Create a virtual scene object and add to the scene
    const sceneObject = await renderer.createModelSceneObject(model, vec3.fromValues(0, 0, -2), vec3.fromValues(-90, 0, 0), vec3.fromValues(0.5, 0.5, 0.5));
    renderer.addSceneObjectToScene(sceneObject);

    // Add an event listener to the AR button
    const arButton = document.querySelector('#btn');
    arButton?.addEventListener('click', startARSession);
}

main();

// Setup our Renderer object
async function setupRenderer() {
    // To get the GL context
    const canvas = document.createElement('canvas');

    renderer = await GLRenderer.RendererInstance(canvas, {
        powerPreference: "high-performance",
        antialias: false,
        alpha: true,
        depth: true,
        stencil: false,
        xrCompatible: true
    });

    // Add a virtual light
    const light: GLDirectionalLight = renderer.createDirectionalLight(1, vec3.fromValues(1, 1, 1), 1, vec3.fromValues(2, -1, -2));
    renderer.addLightToScene(light);

    // We need the GL context to pass that to XR
    gl = renderer.getGL();
}

/**
 * 
 * @returns whether AR is supported or not
 */
async function isARSupported() : Promise<boolean> {
    if(!navigator.xr) {
        console.error("WebXR not supported");
        return false;
    }

    if(!await navigator.xr.isSessionSupported('immersive-ar')) {
        console.error("WebAR not supported");
        return false;
    }

    return true;
}

async function startARSession() {
    if(!await isARSupported()) {
        return;
    }

    const ARSession : XRSession = await navigator.xr?.requestSession('immersive-ar', options) as XRSession;
    ARSession.addEventListener('end', () => {
        shutDownARSession(ARSession);
    });

    // Create a WebGL layer to present the rendered frames to the session.
    await ARSession.updateRenderState({
        baseLayer: new XRWebGLLayer(ARSession, gl)
    });

    // Request the reference spaces
    viewerRefSpace = await ARSession.requestReferenceSpace('viewer');
    localRefSpace = await ARSession.requestReferenceSpace('local');
    unboundedRefSpace = await ARSession.requestReferenceSpace('unbounded');

    // Request the animation frame
    const animationID = ARSession.requestAnimationFrame(onDrawFrame);
}

async function shutDownARSession(session: XRSession) {
    await session.end();
}

function onDrawFrame(t: DOMHighResTimeStamp, frame: XRFrame) {
    // Get the current session and request the next frame
    const session = frame.session;
    session.requestAnimationFrame(onDrawFrame);
    
    // Get the viewer's pose
    const pose = frame.getViewerPose(unboundedRefSpace); // We need the world refernce space to do the rendering

    if(pose) {
        // Get the rendering layers and the views
        const glLayer = session.renderState.baseLayer as XRWebGLLayer;
        const views = pose.views;

        // Do the Rendering
        gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
        
        gl.clearColor(0, 0, 0, 0); // RGBA values, fully transparent
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const scene = renderer.getScene() as GLScene; // Contains the virtual objects
        const shader = renderer.getShader() as Shader;

        shader.useShader(); // Use the shader program

        for(let i = 0; i < views.length; i++) { // As this is AR, only one view
            const viewport = glLayer.getViewport(views[i]) as XRViewport;
            renderer.setViewPort(viewport.x, viewport.y, viewport.width, viewport.height);  // Set the frambuffer viewport. This matches the camera display
            const uniforms = renderer.getUniforms();
            renderer.useLights(scene, uniforms);

            const projectionMatrix = views[i].projectionMatrix;
            const viewMatrix = views[i].transform.inverse.matrix; // Inverse because view camera / the user should be at the origin
    
            gl.uniformMatrix4fv(uniforms.uniformProjection, false, projectionMatrix);
            gl.uniformMatrix4fv(uniforms.uniformView, false, viewMatrix);

            const sceneObjects = scene.getSceneObjects();
            for(let i = 0; i < sceneObjects.length; i++) {
                renderer.renderSceneObject(sceneObjects[i] as GLSceneObject, mat4.create(), uniforms.uniformModel as WebGLUniformLocation, 
                uniforms.uniformModelInverse as WebGLUniformLocation, uniforms.uniformTexture as WebGLUniformLocation);
            }
        }

        gl.useProgram(null); // Un assign the shader program
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Unbind the framebuffer
    }
}

