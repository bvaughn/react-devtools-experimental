import React from 'react';

function Positioned({ style }) {
  return (
    <div style={{ position: 'absolute', width: 0, height: 0, ...style }} />
  );
}

function OffscreenLeftTop() {
  return <Positioned style={{ left: '-200vw', top: '-200vh' }} />;
}
function OffscreenTop() {
  return <Positioned style={{ left: '50vw', top: '-200vh' }} />;
}
function OffscreenRightTop() {
  return <Positioned style={{ left: '200vw', top: '-200vh' }} />;
}
function OffscreenRight() {
  return <Positioned style={{ left: '200vw', top: '50vh' }} />;
}
function OffscreenRightBottom() {
  return <Positioned style={{ left: '200vw', top: '200vh' }} />;
}
function OffscreenBottom() {
  return <Positioned style={{ left: '50vw', top: '200vh' }} />;
}
function OffscreenLeftBottom() {
  return <Positioned style={{ left: '-200vw', top: '200vh' }} />;
}
function OffscreenLeft() {
  return <Positioned style={{ left: '-200vw', top: '50vh' }} />;
}

export default function Offscreen() {
  return (
    <>
      <h2>Offscreen (tooltip test)</h2>
      <div>
        <OffscreenLeftTop />
        <OffscreenTop />
        <OffscreenRightTop />
        <OffscreenRight />
        <OffscreenRightBottom />
        <OffscreenBottom />
        <OffscreenLeftBottom />
        <OffscreenLeft />
      </div>
    </>
  );
}
