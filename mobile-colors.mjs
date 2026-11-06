// Colour gradient used by both the desktop math shader and the iPhone USDZ texture.
// A colour texture is used instead of USDZ vertex colours (unreliable in Quick Look).
export const PALETTES = Object.freeze([
  [[.12,.47,.74],[.27,.80,.76],[.98,.47,.31]],
  [[.04,.47,.57],[.30,.76,.70],[1,.75,.38]],
  [[.43,.29,.81],[.73,.48,.87],[.99,.58,.70]],
  [[.25,.47,.64],[.40,.68,.78],[.68,.86,.90]]
]);
export function paletteRGB(palette,value){
  const stops=PALETTES[palette]||PALETTES[0];
  const t=Math.max(0,Math.min(1,Number(value)||0));
  const group=t<.5?0:1,weight=t<.5?t*2:(t-.5)*2;
  return stops[group].map((channel,i)=>channel*(1-weight)+stops[group+1][i]*weight);
}
export function palettePixels(palette,width=512){
  const arr=new Uint8ClampedArray(width*4);
  for(let j=0;j<width;j++){
    const col=paletteRGB(palette,j/(width-1));
    for(let i=0;i<3;i++)arr[j*4+i]=Math.round(col[i]*255);
    arr[j*4+3]=255;
  }
  return arr;
}
