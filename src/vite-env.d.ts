/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_PACKAGE_ID: string
  readonly VITE_REGISTRY_ID: string
  readonly VITE_SERVER_OBJECT_ID_1: string
  readonly VITE_SERVER_OBJECT_ID_2: string
  readonly VITE_WALRUS_PUBLISHER_URL: string
  readonly VITE_WALRUS_AGGREGATOR_URL: string
  readonly VITE_BASE_PRICE_PER_DAY: string

}

interface ImportMeta {
  readonly env: ImportMetaEnv
}