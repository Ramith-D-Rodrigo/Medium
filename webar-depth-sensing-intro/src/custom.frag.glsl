#version 300 es

precision highp float;

in vec2 texCoord;

uniform sampler2D depthTexture;
uniform mat4 depthUVTransform; // UV transform matrix in normalized view space
uniform float depthScale; // Depth scale factor (unspecified unit to meters)
uniform vec2 resolution; // Resolution of the depth texture

const highp float kMaxDepth = 8.0; // Max depth in meters

out vec4 color;

// Convert depth texture value to meters
float depthGetMeters(in sampler2D depth_texture, in vec2 depth_uv) {
    vec2 packedDepthAndVisibility = texture(depth_texture, depth_uv).ra;
    return dot(packedDepthAndVisibility, vec2(255.0, 256.0 * 255.0)) * depthScale;
}

// Convert fragment coordinates to normalized [0,1] UV space
vec2 normalizeFragCoords(in vec2 fragCoords) {
    //fragCoords's left lower corner is (0.5, 0.5)
    //normalized one should have (0,0) on top left corner and (1,1) on bottom right corner
    //resolution's x and y are the width and height of the screen respectively
    return vec2(fragCoords.x / resolution.x, 1.0 - fragCoords.y / resolution.y);
}

// Maps a value from one range to another
float mapRange(float inputValue, float inputMin, float inputMax, float outputMin, float outputMax) {
    return outputMin + (inputValue - inputMin) * (outputMax - outputMin) / (inputMax - inputMin);
}

void main() {
    // Transform screen-space coordinates to depth texture UV
    vec2 depthTexCoord = (depthUVTransform * vec4(normalizeFragCoords(gl_FragCoord.xy), 0, 1)).xy;

    // Sample depth and convert to meters
    float depth = depthGetMeters(depthTexture, depthTexCoord);

    // Map depth to grayscale range [0,1]
    float mappedValue = mapRange(clamp(depth, 0.0, kMaxDepth), 0.0, kMaxDepth, 0.0, 1.0);

    // Visualize as grayscale
    color = vec4(vec3(mappedValue), 1.0);
}
