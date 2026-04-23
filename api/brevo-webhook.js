export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const email = req.body.email;
  if (!email) return res.status(200).send("No email");

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log("API key missing");
    return res.status(200).send("No API key");
  }

  const contactResponse = await fetch(
    `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
    {
      headers: { "api-key": apiKey }
    }
  );

  const contactData = await contactResponse.json();
  console.log("Fetched:", contactData);

  const fullName = contactData.attributes?.FULL_NAME;
  if (!fullName) return res.status(200).send("No FULL_NAME");

  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift();
  const lastName = parts.join(" ") || "";

  const updateResponse = await fetch(
    `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
    {
      method: "PUT",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        attributes: {
          FIRSTNAME: firstName,
          LASTNAME: lastName
        }
      })
    }
  );

  console.log("Update status:", updateResponse.status);

  return res.status(200).send("Done");
}
