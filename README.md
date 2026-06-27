# MR3D Draw

Modelador 3D web con soporte WebXR para Meta Quest.

## Desarrollo local

```bash
npm install
npm run dev
```

La vista 2D funciona en `localhost`, pero una sesión inmersiva debe probarse desde un visor compatible.

## Probar en Meta Quest

1. Publica el proyecto con el workflow de GitHub Pages incluido.
2. Abre `https://maurichilean3d.github.io/Mr3d-draw/` en Meta Quest Browser.
3. Elige **VR · Meta Quest** y acepta el permiso de realidad virtual.
4. Usa el gatillo para seleccionar, el agarre izquierdo para crear un cubo frente al controlador y el agarre derecho para eliminar el objeto seleccionado.

WebXR requiere HTTPS. Una dirección IP local servida por HTTP no habilita VR en el visor.

## Compilar

```bash
npm run build
```

El resultado se genera en `dist/`.
