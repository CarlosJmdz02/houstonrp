import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { createClient } from "@supabase/supabase-js";
import { createCanvas, loadImage } from "canvas";
import noblox from "noblox.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default {
  data: new SlashCommandBuilder()
    .setName("ver-id")
    .setDescription("🪪 Ver cédula RP")
    .addUserOption(option =>
      option.setName("usuario")
        .setDescription("Usuario a consultar (opcional)")
        .setRequired(false)),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser("usuario") || interaction.user;
      const isSelf = targetUser.id === interaction.user.id;

      console.log("🔍 BUSCANDO USER_DISCORD:", targetUser.id);

      const { data: allData, error: searchError } = await supabase
        .from("characters")
        .select("user_discord")
        .eq("user_discord", targetUser.id);

      console.log("🔍 REGISTROS ENCONTRADOS:", JSON.stringify(allData));
      console.log("🔍 ERROR SEARCH:", searchError);

      /* ============================= */
      /* 🔥 GET DATA FROM SUPABASE */
      /* ============================= */

      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .eq("user_discord", targetUser.id)
        .single();

      if (!data) {
        return interaction.editReply({
          content: isSelf
            ? "❌ No tienes una cédula registrada en la web https://houstoncomunnity.netlify.app/index.html."
            : "❌ Ese usuario no tiene una cédula registrada."
        });
      }

      /* ============================= */
      /* 🔥 CANVAS SETUP */
      /* ============================= */

      const canvas = createCanvas(1024, 652);
      const ctx = canvas.getContext("2d");

      const fondo = await loadImage("./images/id.png");
      ctx.drawImage(fondo, 0, 0, canvas.width, canvas.height);

      /* ============================= */
      /* 🔥 ROBLOX AVATAR */
      /* ============================= */

      try {
        const userId = await noblox.getIdFromUsername(data.roblox);

        const avatarData = await noblox.getPlayerThumbnail(
          userId,
          "420x420",
          "png",
          false,
          "headshot"
        );

        const avatar = await loadImage(avatarData[0].imageUrl);

        ctx.drawImage(avatar, 45, 160, 230, 330);

      } catch (e) {
        console.log("❌ Error avatar Roblox", e);
      }

      /* ============================= */
      /* 🔥 DATA CLEAN */
      /* ============================= */

      const nombre = (data.nombres || "").toUpperCase();
      const apellido = (data.apellidos || "").toUpperCase();
      const direccion = (data.direccion || "").toUpperCase();
      const fecha = (data.dob || "").toUpperCase();
      const ojos = (data.ojos || "").toUpperCase();
      const sexo = (data.sexo || "").toUpperCase();
      const altura = (data.altura || "").toUpperCase();

      // Calcular edad desde fecha de nacimiento
      let edadTexto = "";
      if (data.dob) {
        const [ano, mes, dia] = data.dob.split("-").map(Number);
        if (ano && mes && dia) {
          const hoy = new Date();
          let edad = hoy.getFullYear() - ano;
          if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad--;
          edadTexto = `${edad} AÑOS`;
        }
      }

      /* ============================= */
      /* 🔥 TEXT ON ID */
      /* ============================= */

      ctx.fillStyle = "#111111";
      ctx.textAlign = "left";

      ctx.font = "bold 28px Arial";
      ctx.fillText(nombre, 330, 322);
      ctx.fillText(apellido, 335, 365);
      ctx.fillText(direccion, 315, 430);
      ctx.fillText(fecha, 385, 275);
      ctx.fillText(edadTexto, 315, 295);
      ctx.fillText(altura, 390, 516);

      ctx.font = "bold 20px Arial";
      ctx.fillText(ojos, 815, 515);
      ctx.fillText(sexo, 560, 514);

      /* ============================= */
      /* 🔥 FIRMA (TEMP FIX) */
      /* ============================= */

      ctx.font = "bold 35px Arial";
      ctx.fillText("CarlosJndz002", 125, 150);

      /* ============================= */
      /* 🔥 EXPORT IMAGE */
      /* ============================= */

      const buffer = canvas.toBuffer("image/png");

      const file = new AttachmentBuilder(buffer, {
        name: "cedula-rp.png"
      });

      await interaction.editReply({
        files: [file]
      });

    } catch (err) {
      console.log("❌ ERROR VER-ID", err);

      if (!interaction.replied) {
        await interaction.reply({
          content: "❌ Error al generar la cédula.",
          flags: 64
        });
      }
    }
  }
};