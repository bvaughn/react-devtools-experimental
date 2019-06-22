// @flow

import React from 'react';

export default function SimpleValues() {
  return (
    <ChildComponent
      string="abc"
      emptyString=""
      number={123}
      boolean={true}
      undefined={undefined}
      null={null}
      nan={NaN}
      true={true}
      false={false}
    />
  );
}

function ChildComponent(props: any) {
  return null;
}
