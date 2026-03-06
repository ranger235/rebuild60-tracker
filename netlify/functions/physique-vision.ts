import OpenAI from "openai"

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function handler(event:any) {

  try {

    const { imageA, imageB } = JSON.parse(event.body)

    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Compare these two bodybuilding progress photos.

Evaluate:

1. Shoulder width
2. Chest fullness
3. Waist width
4. V-taper
5. Muscularity
6. Conditioning
7. Symmetry
8. Posture

Return concise observations and an overall interpretation.

Focus on visible physique changes only.
`
            },
            {
              type: "input_image",
              image_url: imageA
            },
            {
              type: "input_image",
              image_url: imageB
            }
          ]
        }
      ]
    })

    return {
      statusCode: 200,
      body: JSON.stringify({
        analysis: response.output_text
      })
    }

  } catch (err:any) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    }

  }
}
