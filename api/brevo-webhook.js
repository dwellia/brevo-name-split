export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const email = req.body.email;

  if (!email) {
    console.log("No email in webhook payload");
    return res.status(200).send("No email");
  }

  const response = await fetch(
    `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
    {
      method: "GET",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json();
  console.log("FULL CONTACT DATA:", JSON.stringify(data, null, 2));

  return res.status(200).send("Logged");
}
