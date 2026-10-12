// Lector de .csb (Cocos Studio, FlatBuffers) → árbol de nodos en JSON (D49). Ver NOTAS.md, "Interfaz F2".
//
// El esquema es el público de cocos2d-x (cocos/editor-support/cocostudio/CSParseBinary.fbs, licencia MIT),
// versión de cocos2d-x 3.7 (el juego): los .csb del juego dicen "2.1.0.0" (versión de Cocos Studio).
// Cada nodo es {classname, children, options:{data}, customClassName}; `data` es un WidgetOptions (Node,
// Layer, Scene…) o un table de opciones de la clase cuyo primer campo es el WidgetOptions (SpriteOptions,
// ButtonOptions, TextOptions…), como hace CSLoader::nodeWithFlatBuffers con cada *Reader.

import { LectorFB } from './flatbuffers.js';

const STRUCTS = {
  RotationSkew: [['x', 'float'], ['y', 'float']],
  Position: [['x', 'float'], ['y', 'float']],
  Scale: [['x', 'float'], ['y', 'float']],
  AnchorPoint: [['x', 'float'], ['y', 'float']],
  Color: [['a', 'ubyte'], ['r', 'ubyte'], ['g', 'ubyte'], ['b', 'ubyte']],
  ColorVector: [['x', 'float'], ['y', 'float']],
  FlatSize: [['width', 'float'], ['height', 'float']],
  CapInsets: [['x', 'float'], ['y', 'float'], ['width', 'float'], ['height', 'float']],
  BlendFunc: [['src', 'int'], ['dst', 'int']],
};

const S = (n) => ['struct', n];
const T = (n) => ['table', n];
const V = (t) => ['vector', t];
const RES = T('ResourceData');
const W = ['widgetOptions', T('WidgetOptions')];
const N = ['nodeOptions', T('WidgetOptions')];
// Campos comunes de Panel / ScrollView / PageView / ListView.
const PANEL = [W, ['backGroundImageData', RES], ['clipEnabled', 'bool', false], ['bgColor', S('Color')],
  ['bgStartColor', S('Color')], ['bgEndColor', S('Color')], ['colorType', 'int', 0], ['bgColorOpacity', 'ubyte', 255],
  ['colorVector', S('ColorVector')], ['capInsets', S('CapInsets')], ['scale9Size', S('FlatSize')],
  ['backGroundScale9Enabled', 'bool', false]];

const TABLAS = {
  CSParseBinary: [['version', 'string'], ['textures', V('string')], ['texturePngs', V('string')],
    ['nodeTree', T('NodeTree')], ['action', T('NodeAction')], ['animationList', V(T('AnimationInfo'))]],
  NodeTree: [['classname', 'string'], ['children', V(T('NodeTree'))], ['options', ['options']], ['customClassName', 'string']],
  WidgetOptions: [['name', 'string'], ['actionTag', 'int', 0], ['rotationSkew', S('RotationSkew')], ['zOrder', 'int', 0],
    ['visible', 'bool', true], ['alpha', 'ubyte', 255], ['tag', 'int', 0], ['position', S('Position')], ['scale', S('Scale')],
    ['anchorPoint', S('AnchorPoint')], ['color', S('Color')], ['size', S('FlatSize')], ['flipX', 'bool', false],
    ['flipY', 'bool', false], ['ignoreSize', 'bool', false], ['touchEnabled', 'bool', false], ['frameEvent', 'string'],
    ['customProperty', 'string'], ['callBackType', 'string'], ['callBackName', 'string'],
    ['layoutComponent', T('LayoutComponentTable')]],
  LayoutComponentTable: [['positionXPercentEnabled', 'bool'], ['positionYPercentEnabled', 'bool'],
    ['positionXPercent', 'float'], ['positionYPercent', 'float'], ['sizeXPercentEnable', 'bool'],
    ['sizeYPercentEnable', 'bool'], ['sizeXPercent', 'float'], ['sizeYPercent', 'float'],
    ['stretchHorizontalEnabled', 'bool'], ['stretchVerticalEnabled', 'bool'], ['horizontalEdge', 'string'],
    ['verticalEdge', 'string'], ['leftMargin', 'float'], ['rightMargin', 'float'], ['topMargin', 'float'],
    ['bottomMargin', 'float']],
  ResourceData: [['path', 'string'], ['plistFile', 'string'], ['resourceType', 'int', 0]],
  SingleNodeOptions: [N],
  SpriteOptions: [N, ['fileNameData', RES], ['blendFunc', S('BlendFunc')]],
  ParticleSystemOptions: [N, ['fileNameData', RES], ['blendFunc', S('BlendFunc')]],
  GameMapOptions: [N, ['fileNameData', RES]],
  ButtonOptions: [W, ['normalData', RES], ['pressedData', RES], ['disabledData', RES], ['fontResource', RES],
    ['text', 'string'], ['fontName', 'string'], ['fontSize', 'int', 0], ['textColor', S('Color')],
    ['capInsets', S('CapInsets')], ['scale9Size', S('FlatSize')], ['scale9Enabled', 'bool', false],
    ['displaystate', 'bool', true], ['outlineEnabled', 'bool', false], ['outlineColor', S('Color')],
    ['outlineSize', 'int', 1], ['shadowEnabled', 'bool', false], ['shadowColor', S('Color')],
    ['shadowOffsetX', 'float', 2], ['shadowOffsetY', 'float', -2], ['shadowBlurRadius', 'int', 0],
    ['isLocalized', 'bool', false]],
  CheckBoxOptions: [W, ['backGroundBoxData', RES], ['backGroundBoxSelectedData', RES], ['frontCrossData', RES],
    ['backGroundBoxDisabledData', RES], ['frontCrossDisabledData', RES], ['selectedState', 'bool', true],
    ['displaystate', 'bool', true]],
  ImageViewOptions: [W, ['fileNameData', RES], ['capInsets', S('CapInsets')], ['scale9Size', S('FlatSize')],
    ['scale9Enabled', 'bool', false]],
  TextAtlasOptions: [W, ['charMapFileData', RES], ['stringValue', 'string'], ['startCharMap', 'string'],
    ['itemWidth', 'int', 0], ['itemHeight', 'int', 0]],
  TextBMFontOptions: [W, ['fileNameData', RES], ['text', 'string'], ['isLocalized', 'bool', false]],
  TextOptions: [W, ['fontResource', RES], ['fontName', 'string'], ['fontSize', 'int', 0], ['text', 'string'],
    ['areaWidth', 'int', 0], ['areaHeight', 'int', 0], ['hAlignment', 'int', 0], ['vAlignment', 'int', 0],
    ['touchScaleEnable', 'bool', false], ['isCustomSize', 'bool', false], ['outlineEnabled', 'bool', false],
    ['outlineColor', S('Color')], ['outlineSize', 'int', 1], ['shadowEnabled', 'bool', false],
    ['shadowColor', S('Color')], ['shadowOffsetX', 'float', 2], ['shadowOffsetY', 'float', -2],
    ['shadowBlurRadius', 'int', 0], ['isLocalized', 'bool', false]],
  TextFieldOptions: [W, ['fontResource', RES], ['fontName', 'string'], ['fontSize', 'int', 0], ['text', 'string'],
    ['placeHolder', 'string'], ['passwordEnabled', 'bool', false], ['passwordStyleText', 'string'],
    ['maxLengthEnabled', 'bool', false], ['maxLength', 'int', 0], ['areaWidth', 'int', 0], ['areaHeight', 'int', 0],
    ['isCustomSize', 'bool', false], ['isLocalized', 'bool', false]],
  LoadingBarOptions: [W, ['textureData', RES], ['percent', 'int', 80], ['direction', 'int', 0]],
  SliderOptions: [W, ['barFileNameData', RES], ['ballNormalData', RES], ['ballPressedData', RES],
    ['ballDisabledData', RES], ['progressBarData', RES], ['percent', 'int', 50], ['displaystate', 'bool', true]],
  PanelOptions: PANEL,
  ScrollViewOptions: [...PANEL, ['innerSize', S('FlatSize')], ['direction', 'int', 0], ['bounceEnabled', 'bool', false],
    ['scrollbarEnabeld', 'bool', true], ['scrollbarAutoHide', 'bool', true], ['scrollbarAutoHideTime', 'float', 0.2]],
  PageViewOptions: PANEL,
  ListViewOptions: [...PANEL, ['innerSize', S('FlatSize')], ['direction', 'int', 0], ['bounceEnabled', 'bool', false],
    ['itemMargin', 'int', 0], ['directionType', 'string'], ['horizontalType', 'string'], ['verticalType', 'string']],
  ProjectNodeOptions: [N, ['fileName', 'string'], ['innerActionSpeed', 'float', 1]],
  ComponentOptions: [N, ['type', 'string']],
  // Animación de línea de tiempo (Cocos Studio).
  AnimationInfo: [['name', 'string'], ['startIndex', 'int', 0], ['endIndex', 'int', 0]],
  NodeAction: [['duration', 'int', 0], ['speed', 'float', 1], ['timeLines', V(T('TimeLine'))], ['currentAnimationName', 'string']],
  TimeLine: [['property', 'string'], ['actionTag', 'int', 0], ['frames', V(T('Frame'))]],
  Frame: [['pointFrame', T('PointFrame')], ['scaleFrame', T('ScaleFrame')], ['colorFrame', T('ColorFrame')],
    ['textureFrame', T('TextureFrame')], ['eventFrame', T('EventFrame')], ['intFrame', T('IntFrame')],
    ['boolFrame', T('BoolFrame')], ['innerActionFrame', T('InnerActionFrame')], ['blendFrame', T('BlendFrame')]],
  PointFrame: [['frameIndex', 'int', 0], ['tween', 'bool', true], ['position', S('Position')], ['easingData', T('EasingData')]],
  ScaleFrame: [['frameIndex', 'int', 0], ['tween', 'bool', true], ['scale', S('Scale')], ['easingData', T('EasingData')]],
  ColorFrame: [['frameIndex', 'int', 0], ['tween', 'bool', true], ['color', S('Color')], ['easingData', T('EasingData')]],
  TextureFrame: [['frameIndex', 'int', 0], ['tween', 'bool', true], ['textureFile', RES], ['easingData', T('EasingData')]],
  EventFrame: [['frameIndex', 'int', 0], ['tween', 'bool', true], ['value', 'string'], ['easingData', T('EasingData')]],
  IntFrame: [['frameIndex', 'int', 0], ['tween', 'bool', true], ['value', 'int', 0], ['easingData', T('EasingData')]],
  BoolFrame: [['frameIndex', 'int', 0], ['tween', 'bool', true], ['value', 'bool', true], ['easingData', T('EasingData')]],
  InnerActionFrame: [['frameIndex', 'int', 0], ['tween', 'bool', true], ['innerActionType', 'int', 0],
    ['currentAniamtionName', 'string'], ['singleFrameIndex', 'int', 0], ['easingData', T('EasingData')]],
  BlendFrame: [['frameIndex', 'int', 0], ['tween', 'bool', true], ['blendFunc', S('BlendFunc')], ['easingData', T('EasingData')]],
  EasingData: [['type', 'int', -1]],
};

// Clase del nodo → table de sus opciones (los *Reader de cocostudio). Las que no están (Node, Layer,
// Scene…) usan el WidgetOptions directamente (NodeReader).
export const OPCIONES = {
  SingleNode: 'SingleNodeOptions', Sprite: 'SpriteOptions', Particle: 'ParticleSystemOptions',
  GameMap: 'GameMapOptions', Button: 'ButtonOptions', CheckBox: 'CheckBoxOptions', ImageView: 'ImageViewOptions',
  TextAtlas: 'TextAtlasOptions', TextBMFont: 'TextBMFontOptions', Text: 'TextOptions', TextField: 'TextFieldOptions',
  LoadingBar: 'LoadingBarOptions', Slider: 'SliderOptions', Panel: 'PanelOptions', ScrollView: 'ScrollViewOptions',
  PageView: 'PageViewOptions', ListView: 'ListViewOptions', ProjectNode: 'ProjectNodeOptions',
};

class LectorCSB extends LectorFB {
  // NodeTree.options es un table Options {data}; `data` se lee según la clase del nodo.
  valor(tipo, pos) {
    if (Array.isArray(tipo) && tipo[0] === 'options') return { _pos: this.indirecto(pos) };
    return super.valor(tipo, pos);
  }

  nodo(pos) {
    const t = this.tabla('NodeTree', pos);
    const clase = t.classname ?? 'Node';
    let data = null;
    if (t.options) {
      const opciones = t.options._pos;
      const o = this.campo(opciones, 0);
      if (o) {
        const p = this.indirecto(opciones + o);
        const esquema = OPCIONES[clase] ?? 'WidgetOptions';
        data = this.tabla(esquema, p);
      }
    }
    const comun = data?.widgetOptions ?? data?.nodeOptions ?? data ?? {};
    const hijos = [];
    const oh = this.campo(pos, 1);
    if (oh) {
      const v = this.indirecto(pos + oh);
      const n = this.dv.getUint32(v, true);
      for (let i = 0; i < n; i++) hijos.push(this.nodo(this.indirecto(v + 4 + 4 * i)));
    }
    return normalizar(clase, t.customClassName, comun, data, hijos);
  }
}

const recurso = (r) => (r?.path ? { path: r.path, plist: r.plistFile || null, tipo: r.resourceType } : null);

function normalizar(clase, custom, w, data, hijos) {
  const n = {
    clase,
    nombre: w.name ?? '',
    tag: w.tag ?? 0,
    actionTag: w.actionTag ?? 0,
    visible: w.visible ?? true,
    alpha: w.alpha ?? 255,
    x: w.position?.x ?? 0,
    y: w.position?.y ?? 0,
    ancho: w.size?.width ?? 0,
    alto: w.size?.height ?? 0,
    anclaX: w.anchorPoint?.x ?? 0,
    anclaY: w.anchorPoint?.y ?? 0,
    escalaX: w.scale?.x ?? 1,
    escalaY: w.scale?.y ?? 1,
    rotX: w.rotationSkew?.x ?? 0,
    rotY: w.rotationSkew?.y ?? 0,
    color: w.color ? { r: w.color.r, g: w.color.g, b: w.color.b } : { r: 255, g: 255, b: 255 },
    flipX: w.flipX ?? false,
    flipY: w.flipY ?? false,
    zOrder: w.zOrder ?? 0,
    tactil: w.touchEnabled ?? false,
    ignorarTam: w.ignoreSize ?? false,
    hijos,
  };
  if (custom) n.claseCustom = custom;
  if (w.customProperty) n.propiedad = w.customProperty;
  if (w.callBackName) n.callback = { tipo: w.callBackType ?? '', nombre: w.callBackName };
  if (w.frameEvent) n.eventoCuadro = w.frameEvent;
  if (w.layoutComponent) n.layout = w.layoutComponent;
  if (!data || data === w) return n;
  const d = data;
  const img = recurso(d.fileNameData ?? d.textureData ?? d.backGroundImageData ?? d.charMapFileData);
  if (img) n.imagen = img;
  if (clase === 'Button') {
    n.boton = { normal: recurso(d.normalData), pulsado: recurso(d.pressedData), desactivado: recurso(d.disabledData),
      activo: d.displaystate };
  }
  if (clase === 'CheckBox') {
    n.casilla = { fondo: recurso(d.backGroundBoxData), marca: recurso(d.frontCrossData), marcada: d.selectedState };
  }
  if ('text' in d || 'stringValue' in d) n.texto = d.text ?? d.stringValue ?? '';
  if (d.fontSize) n.tamFuente = d.fontSize;
  if (d.fontResource?.path || d.fontName) n.fuente = d.fontResource?.path || d.fontName;
  if (d.textColor) n.colorTexto = { r: d.textColor.r, g: d.textColor.g, b: d.textColor.b };
  if ('hAlignment' in d) Object.assign(n, { alineH: d.hAlignment, alineV: d.vAlignment, tamPropio: d.isCustomSize });
  if (d.outlineEnabled) n.contorno = { color: d.outlineColor, tam: d.outlineSize };
  if (d.shadowEnabled) n.sombra = { color: d.shadowColor, x: d.shadowOffsetX, y: d.shadowOffsetY };
  if (d.scale9Enabled || d.backGroundScale9Enabled) n.scale9 = { insets: d.capInsets, tam: d.scale9Size };
  if (clase === 'LoadingBar') Object.assign(n, { porcentaje: d.percent, direccion: d.direction });
  if ('clipEnabled' in d) {
    n.panel = { recorte: d.clipEnabled, tipoColor: d.colorType, color: d.bgColor, opacidad: d.bgColorOpacity,
      inicio: d.bgStartColor, fin: d.bgEndColor };
  }
  if (d.innerSize) n.interior = { ancho: d.innerSize.width, alto: d.innerSize.height, direccion: d.direction };
  if (d.fileName) n.archivo = d.fileName; // ProjectNode: otro .csb dentro de este
  if (d.blendFunc) n.mezcla = d.blendFunc;
  return n;
}

/** Lee un .csb: { version, texturas, raiz (árbol de nodos), animaciones, accion }. */
export function leerCSB(buffer) {
  const r = new LectorCSB(buffer, STRUCTS, TABLAS);
  const raiz = r.raiz();
  const camposRaiz = TABLAS.CSParseBinary;
  const leer = (i) => {
    const o = r.campo(raiz, i);
    return o ? r.valor(camposRaiz[i][1], raiz + o) : undefined;
  };
  const oNodo = r.campo(raiz, 3);
  return {
    version: leer(0) ?? '',
    texturas: leer(1) ?? [],
    pngs: leer(2) ?? [],
    raiz: oNodo ? r.nodo(r.indirecto(raiz + oNodo)) : null,
    accion: leer(4) ?? null,
    animaciones: leer(5) ?? [],
  };
}

/** Recorre el árbol (primero el nodo, luego sus hijos). */
export function* recorrer(nodo, padres = []) {
  yield [nodo, padres];
  for (const h of nodo.hijos) yield* recorrer(h, [...padres, nodo]);
}

/** Primer nodo con ese nombre (o null). */
export function buscar(raiz, nombre) {
  for (const [n] of recorrer(raiz)) if (n.nombre === nombre) return n;
  return null;
}
