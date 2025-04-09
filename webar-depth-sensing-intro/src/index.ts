import { GLModel, GLRenderer, Shader} from "./webgl-framework";
import vertexShader from "./custom.vert.glsl";
import fragmentShader from "./custom.frag.glsl";

// Global Variables
let gl : WebGL2RenderingContext;
let renderer : GLRenderer;
let depthTexture: WebGLTexture;
let customShader: Shader;

const options : XRSessionInit = {
    requiredFeatures: ['unbounded', 'depth-sensing'], // request depth-sensing feature
    depthSensing: {
        dataFormatPreference: ['luminance-alpha'],
        usagePreference: ['cpu-optimized']
    }
}

let viewerRefSpace : XRReferenceSpace;
let localRefSpace : XRReferenceSpace;
let unboundedRefSpace: XRReferenceSpace;

async function main() {
    await setupRenderer();

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

    // We need the GL context to pass that to XR
    gl = renderer.getGL();

    // Initialize depth texture
    depthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Create a custom shader
    customShader = Shader.getInstance(gl);
    customShader.createFromString(vertexShader, fragmentShader);
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

        customShader.useShader();

        for(let i = 0; i < views.length; i++) { // As this is AR, only one view
            const viewport = glLayer.getViewport(views[i]) as XRViewport;
            renderer.setViewPort(viewport.x, viewport.y, viewport.width, viewport.height);  // Set the frambuffer viewport. This matches the camera display
            
            // Depth sensing
            const depthInfo = frame.getDepthInformation(views[i]);
            if(depthInfo){
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, depthTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, 
                    depthInfo.width, depthInfo.height, 
                    0, gl.LUMINANCE_ALPHA, 
                    gl.UNSIGNED_BYTE, 
                    new Uint8Array(depthInfo.data, 0, depthInfo.data.byteLength)
                );
                
                gl.uniform1i(customShader.getUniformDepthTexture(), 0);
                // Set up UV transform
                const uvTransformLocation = customShader.getUniformDepthUVTransform();
                const matrix = depthInfo.normDepthBufferFromNormView.matrix;
                // Bind the uv transform matrix
                gl.uniformMatrix4fv(uvTransformLocation, false, matrix);
                // Set the depth scale
                const depthScaleLocation = customShader.getUniformDepthScale();
                gl.uniform1f(depthScaleLocation, depthInfo.rawValueToMeters);
                // Set the resolution
                gl.uniform2f(customShader.getUniformResolution(), viewport.width, viewport.height);
            }
            

            // Draw two triangles to encompass the whole screen (Already defined in the shader)
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        gl.useProgram(null); // Un assign the shader program
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Unbind the framebuffer
    }
}

