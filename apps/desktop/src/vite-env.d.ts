/// <reference path="../node_modules/vite/client.d.ts" />

declare var React: any;
declare namespace React {
  type ComponentType<P = any> = any;
  type ElementType = any;
  type ReactNode = any;
  type ReactElement<P = any, T = any> = any;
  type SVGProps<E = any> = any;
  type RefAttributes<T = any> = any;
  type FormEvent<T = any> = any;
  type ChangeEvent<T = any> = any;
  type KeyboardEvent<T = any> = any;
  type DragEvent<T = any> = any;
  type TextareaHTMLAttributes<T = any> = any;
}
declare namespace JSX {
  interface LibraryManagedAttributes<C, P> {
    [key: string]: any;
  }
  interface IntrinsicAttributes {
    [key: string]: any;
  }
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare namespace React {
  type ElementType = any;
  type ComponentType<P = any> = any;
  type SVGProps<E = any> = any;
  type RefAttributes<T = any> = any;
  type ForwardRefExoticComponent<P = any> = any;
}
declare namespace JSX {
  interface LibraryManagedAttributes<C, P> {
    [key: string]: any;
  }
  interface IntrinsicAttributes {
    [key: string]: any;
  }
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
