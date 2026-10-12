// GLSL shared by the world's shaders: noise, the sky, and the haze.

export const NOISE = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
          mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
          mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < FBM_OCTAVES; i++) {
      s += a * vnoise(p);
      p = p * 2.03 + 17.1;
      a *= 0.5;
    }
    return s;
  }
`;

// The sky is one function so the dome and the sea's reflection of it can never disagree.
// Below the horizon it is the haze colour, which is also what the fog fades everything to.
export const SKY = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  vec3 skyColor(vec3 d, float disc) {
    float h = clamp(d.y, 0.0, 1.0);
    vec3 c = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.8, h), 0.85));
    float s = max(dot(d, uSunDir), 0.0);
    c += uSunCol * (0.16 * pow(s, 6.0) + 0.5 * pow(s, 90.0));
    c += uSunCol * disc * 6.0 * smoothstep(0.99965, 0.9999, s);
    return c;
  }
`;

// Exponential-squared haze, matching THREE.FogExp2 so custom shaders sit in the same air as the
// built-in materials.
export const HAZE = /* glsl */ `
  uniform float uFogDensity;
  vec3 haze(vec3 color, float dist) {
    float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    return mix(color, uHorizon, f);
  }
`;

export const FINISH = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
