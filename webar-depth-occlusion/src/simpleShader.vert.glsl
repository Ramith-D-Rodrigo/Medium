#version 300 es

precision highp float;
layout (location = 0) in vec3 position;
layout (location = 1) in vec3 normal;
layout (location = 2) in vec2 tex;

out vec2 texCoord;
out vec3 normalFrag;
out vec4 viewPosition;

uniform mat4 projection;
uniform mat4 model;
uniform mat4 view;
uniform mat4 modelInverse;

void main() {
    viewPosition = view * model * vec4(position, 1.0f);

    gl_Position = projection * viewPosition;

    texCoord = tex;

    normalFrag = mat3(transpose(modelInverse)) * normal;  
    
    //mat3 because we don't want to translate the normal
    //inverse because we want to transform the normal from world space to object space
    //transpose because we want to transform the normal from row-major to column-major
}
