## Packages
@hookform/resolvers | For Zod schema validation with react-hook-form
recharts | For multi-axis visualization on the results page
framer-motion | For smooth, professional transitions between form steps

## Notes
Static images: import logo from @assets/626986E9-B8B4-462B-8F52-CB974B10376C_1772499495236.png
PDF Download expects a Blob response from /api/simulations/:id/pdf
Form inputs will use z.coerce.number() to ensure strings from inputs are parsed to ints before sending to the API.
