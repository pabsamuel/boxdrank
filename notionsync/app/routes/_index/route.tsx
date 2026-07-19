import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>NotionSync — Notion Order & Product Sync</h1>
        <p className={styles.text}>
          Automatically sync your Shopify orders and products into your own
          Notion workspace, in near real-time.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Real-time sync</strong>. Orders and products land in your
            Notion databases seconds after they change in Shopify.
          </li>
          <li>
            <strong>One-click setup</strong>. Connect with a Notion integration token
            and let NotionSync create the databases for you.
          </li>
          <li>
            <strong>Reliable</strong>. Automatic retries, no duplicates, and a
            status page that tells you exactly what synced.
          </li>
        </ul>
      </div>
    </div>
  );
}
