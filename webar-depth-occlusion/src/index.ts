import { mat4, quat, vec3 } from "gl-matrix";
import {
  GLDirectionalLight,
  GLModel,
  GLRenderer,
  GLScene,
  GLSceneObject,
  Shader,
} from "./webgl-framework";
import vertexShader from "./simpleShader.vert.glsl";
import fragmentShader from "./simpleShader.frag.glsl";

// Global Variables
let gl: WebGL2RenderingContext;
let renderer: GLRenderer;
let model: GLModel;
let depthTexture: WebGLTexture;
let customShader: Shader;

let reticleSceneObj: GLSceneObject; // keep the reference to change the transform
let arHitTestSource: XRHitTestSource | undefined;

const options: XRSessionInit = {
  requiredFeatures: ["unbounded", "hit-test", "depth-sensing"], // request depth sensing
  depthSensing: {
    usagePreference: ["cpu-optimized"],
    dataFormatPreference: ["luminance-alpha"],
  },
};

let viewerRefSpace: XRReferenceSpace;
let localRefSpace: XRReferenceSpace;
let unboundedRefSpace: XRReferenceSpace;

async function main() {
  await setupRenderer();

  // Load the model
  model = await renderer.loadModelData("models/yoshikage_kira/scene.gltf");

  // Load the reticle model
  const reticle = await renderer.loadModelData("models/reticle/reticle.gltf");
  reticleSceneObj = await renderer.createModelSceneObject(
    reticle,
    vec3.fromValues(0, 0, 0),
    vec3.fromValues(0, 0, 0),
    vec3.fromValues(1, 1, 1)
  );
  renderer.addSceneObjectToScene(reticleSceneObj);

  // Add an event listener to the AR button
  const arButton = document.querySelector("#btn");
  arButton?.addEventListener("click", startARSession);
}

main();

// Setup our Renderer object
async function setupRenderer() {
  // To get the GL context
  const canvas = document.createElement("canvas");

  renderer = await GLRenderer.RendererInstance(canvas, {
    powerPreference: "high-performance",
    antialias: false,
    alpha: true,
    depth: true,
    stencil: false,
    xrCompatible: true,
  });

  // Add a virtual light
  const light: GLDirectionalLight = renderer.createDirectionalLight(
    1,
    vec3.fromValues(1, 1, 1),
    1,
    vec3.fromValues(2, -1, -2)
  );
  renderer.addLightToScene(light);

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
async function isARSupported(): Promise<boolean> {
  if (!navigator.xr) {
    console.error("WebXR not supported");
    return false;
  }

  if (!(await navigator.xr.isSessionSupported("immersive-ar"))) {
    console.error("WebAR not supported");
    return false;
  }

  return true;
}

async function startARSession() {
  if (!(await isARSupported())) {
    return;
  }

  const ARSession: XRSession = (await navigator.xr?.requestSession(
    "immersive-ar",
    options
  )) as XRSession;
  ARSession.addEventListener("end", () => {
    shutDownARSession(ARSession);
  });

  // Create a WebGL layer to present the rendered frames to the session.
  await ARSession.updateRenderState({
    baseLayer: new XRWebGLLayer(ARSession, gl),
  });

  // Request the reference spaces
  viewerRefSpace = await ARSession.requestReferenceSpace("viewer");
  localRefSpace = await ARSession.requestReferenceSpace("local");
  unboundedRefSpace = await ARSession.requestReferenceSpace("unbounded");

  if (ARSession.requestHitTestSource) {
    arHitTestSource = await ARSession.requestHitTestSource({
      space: viewerRefSpace,
    });

    ARSession.addEventListener("select", onSelect);
  }

  // Request the animation frame
  const animationID = ARSession.requestAnimationFrame(onDrawFrame);
}

async function shutDownARSession(session: XRSession) {
  await session.end();
}

// Function to spawn model on touch select event
async function onSelect(event: Event) {
  const sceneObject = await renderer.createModelSceneObjectFromQuats(
    model,
    reticleSceneObj.getPosition(),
    reticleSceneObj.getRotation(),
    vec3.fromValues(0.5, 0.5, 0.5)
  );

  sceneObject.rotate(vec3.fromValues(-90, 0, 0));

  renderer.addSceneObjectToScene(sceneObject);
}

function onDrawFrame(t: DOMHighResTimeStamp, frame: XRFrame) {
  // Get the current session and request the next frame
  const session = frame.session;
  session.requestAnimationFrame(onDrawFrame);

  // Get the viewer's pose
  const pose = frame.getViewerPose(unboundedRefSpace); // We need the world refernce space to do the rendering

  if (pose) {
    // Get the rendering layers and the views
    const glLayer = session.renderState.baseLayer as XRWebGLLayer;
    const views = pose.views;

    // Check for hit results
    if (arHitTestSource) {
      const hitResults = frame.getHitTestResults(
        arHitTestSource as XRHitTestSource
      );
      if (hitResults.length > 0) {
        let hitResultPose = hitResults[0]?.getPose(unboundedRefSpace);
        if (hitResultPose) {
          let posX = hitResultPose.transform.position.x;
          let posY = hitResultPose.transform.position.y;
          let posZ = hitResultPose.transform.position.z;

          let rotX = hitResultPose.transform.orientation.x;
          let rotY = hitResultPose.transform.orientation.y;
          let rotZ = hitResultPose.transform.orientation.z;
          let rotW = hitResultPose.transform.orientation.w;

          const hitLocationPosition = vec3.fromValues(posX, posY, posZ);
          const hitLocationOrientation = quat.fromValues(
            rotX,
            rotY,
            rotZ,
            rotW
          );

          reticleSceneObj.setPosition(hitLocationPosition);
          reticleSceneObj.setRotation(hitLocationOrientation);
        }
      }
    }

    // Do the Rendering
    gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);

    gl.clearColor(0, 0, 0, 0); // RGBA values, fully transparent
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const scene = renderer.getScene() as GLScene; // Contains the virtual objects

    customShader.useShader(); // Use the custom shader program

    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      if(!view) continue;
      // As this is AR, only one view
      const viewport = glLayer.getViewport(view) as XRViewport;
      renderer.setViewPort(
        viewport.x,
        viewport.y,
        viewport.width,
        viewport.height
      ); // Set the frambuffer viewport. This matches the camera display

      const depthInfo = frame.getDepthInformation(view);
      if (depthInfo) {
        gl.activeTexture(gl.TEXTURE1); //texture 1 because scene object textures are added to 0
        gl.bindTexture(gl.TEXTURE_2D, depthTexture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.LUMINANCE_ALPHA,
          depthInfo.width,
          depthInfo.height,
          0,
          gl.LUMINANCE_ALPHA,
          gl.UNSIGNED_BYTE,
          new Uint8Array(depthInfo.data, 0, depthInfo.data.byteLength)
        );

        gl.uniform1i(customShader.getUniformDepthTexture(), 1); //texture 1 because scene object textures are added to 0
        // Set up UV transform
        const uvTransformLocation = customShader.getUniformDepthUVTransform();
        const matrix = depthInfo.normDepthBufferFromNormView.matrix;
        // Bind the uv transform matrix
        gl.uniformMatrix4fv(uvTransformLocation, false, matrix);
        // Set the depth scale
        const depthScaleLocation = customShader.getUniformDepthScale();
        gl.uniform1f(depthScaleLocation, depthInfo.rawValueToMeters);
        // Set the resolution
        gl.uniform2f(
          customShader.getUniformResolution(),
          viewport.width,
          viewport.height
        );
      }

      const uniforms = renderer.getUniforms();
      renderer.useLights(scene, uniforms);

      const projectionMatrix = view.projectionMatrix;
      const viewMatrix = view.transform.inverse.matrix; // Inverse because view camera / the user should be at the origin

      gl.uniformMatrix4fv(uniforms.uniformProjection, false, projectionMatrix);
      gl.uniformMatrix4fv(uniforms.uniformView, false, viewMatrix);

      const sceneObjects = scene.getSceneObjects();
      for (let i = 0; i < sceneObjects.length; i++) {
        renderer.renderSceneObject(
          sceneObjects[i] as GLSceneObject,
          mat4.create(),
          uniforms.uniformModel as WebGLUniformLocation,
          uniforms.uniformModelInverse as WebGLUniformLocation,
          uniforms.uniformTexture as WebGLUniformLocation
        );
      }
    }

    gl.useProgram(null); // Un assign the shader program
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Unbind the framebuffer
  }
}
