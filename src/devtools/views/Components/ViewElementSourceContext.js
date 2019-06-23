// @flow

import { createContext } from 'react';

import type { ViewElementSource } from 'src/devtools/views/devtools';

export type Context = {|
  isFileLocationRequired: boolean,
  viewElementSourceFunction: ViewElementSource | null,
|};

const ViewElementSourceContext = createContext<Context>(((null: any): Context));
ViewElementSourceContext.displayName = 'ViewElementSourceContext';

export default ViewElementSourceContext;
