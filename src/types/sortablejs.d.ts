declare module "sortablejs" {
  interface SortableOptions {
    animation?: number;
    handle?: string;
    onEnd?: () => void;
  }

  export default class Sortable {
    constructor(element: Element, options?: SortableOptions);
  }
}
