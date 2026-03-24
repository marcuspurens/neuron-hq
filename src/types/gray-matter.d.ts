declare module 'gray-matter' {
  interface GrayMatterFile {
    data: Record<string, unknown>;
    content: string;
  }
  function matter(input: string): GrayMatterFile;
  export = matter;
}
