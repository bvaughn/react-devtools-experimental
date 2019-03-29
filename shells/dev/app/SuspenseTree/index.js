// @flow

import React, { Suspense } from 'react';

function SuspenseTree() {
  return (
    <>
      <h1>Suspense</h1>
      <Suspense fallback={<h2>Loading outer</h2>}>
        <Parent />
      </Suspense>
    </>
  );
}

function Parent() {
  return (
    <div>
      <Suspense fallback={<h3>Loading inner 1</h3>}>
        <Child>Hello</Child>
      </Suspense>
      <Suspense fallback={<h3>Loading inner 2</h3>}>
        <Child>World</Child>
      </Suspense>
    </div>
  );
}

function Child({ children }) {
  return <p>{children}</p>;
}

export default SuspenseTree;
