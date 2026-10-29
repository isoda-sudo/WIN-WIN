declare module "zengin-code" {
  interface ZenginBranch {
    code: string;
    hira: string;
    kana: string;
    name: string;
    roma: string;
  }
  interface ZenginBank {
    branches: Record<string, ZenginBranch>;
    code: string;
    hira: string;
    kana: string;
    name: string;
    roma: string;
  }
  const zenginCode: Record<string, ZenginBank>;
  export default zenginCode;
}
