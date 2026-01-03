#version 300 es

precision highp float;

in vec2 texCoord;
in vec3 normalFrag;
in vec4 viewPosition;

uniform sampler2D depthTexture;
uniform mat4 depthUVTransform; // UV transform matrix in normalized view space
uniform float depthScale; // Depth scale factor (unspecified unit to meters)
uniform vec2 resolution; // Resolution of the depth texture

out vec4 color;

struct DirectionalLight {
    vec3 color;
    float ambientIntensity;
    vec3 direction;
    float diffuseIntensity;
};

uniform sampler2D theTexture;
uniform DirectionalLight directionalLight;

float DepthGetMeters(in sampler2D depth_texture, in vec2 depth_uv) {
    vec2 packedDepthAndVisibility = texture(depth_texture, depth_uv).ra;
    return dot(packedDepthAndVisibility, vec2(255.0, 256.0 * 255.0)) * depthScale;
}

vec2 NormalizeFragCoords(in vec2 fragCoords) {
    //fragCoords's left lower corner is (0.5, 0.5)
    //normalized one should have (0,0) on top left corner and (1,1) on bottom right corner
    //resolution's x and y are the width and height of the screen respectively
    
    return vec2(fragCoords.x / resolution.x, 1.0 - fragCoords.y / resolution.y);
}

void main() {
    vec2 depthTexCoord = (depthUVTransform * vec4(NormalizeFragCoords(gl_FragCoord.xy), 0, 1)).xy;
    float depth = DepthGetMeters(depthTexture, depthTexCoord);

    if(depth < (viewPosition.z) * -1.0f) { //virtual object is behind the real object
        discard; //discard the virtual object
    }

    vec4 ambientColor = vec4(directionalLight.color, 1.0) * directionalLight.ambientIntensity;

    float diffuseFactor = max(dot(normalize(normalFrag), -normalize(directionalLight.direction)), 0.0f);
    vec4 diffuseColor = vec4(directionalLight.color, 1.0) * directionalLight.diffuseIntensity * diffuseFactor;

    vec4 textureVal = texture(theTexture, texCoord);
    color = textureVal * (ambientColor + diffuseColor);
}
