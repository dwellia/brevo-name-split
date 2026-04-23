import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const event = req.body;

  if (event.event !== "contact_created") {
    return res.status(200).send("Ignored");
  }

  const email = event.email;
  const fullName = event.attributes?.FULLNAME;

  if (!email || !fullName) {
    return res.status(200).send("No name");
  }

  const parts = fullName.trim().split(" ");
  const firstName = parts.shift();
  const lastName = parts.join(" ");

  await axios.put(
    `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
    {
      attributes: {
        FIRSTNAME: firstName,
        LASTNAME: lastName
      }
    },
    {
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  return res.status(200).send("Updated");
}
