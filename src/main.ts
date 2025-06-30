import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common'

console.log('Environment Variables:', JSON.stringify(process.env, null, 2)); // Depurar variables de entorno

async function bootstrap() {
  console.log('🕒 Backend timezone check:', new Date().toString());
  console.log('🕒 ISO:', new Date().toISOString());

  const app = await NestFactory.create(AppModule);

  // Middleware personalizado para configurar CORS manualmente
  app.use((req, res, next) => {
    const allowedOrigins = ['https://novadrivingone.net', 'https://www.novadrivingone.net', 'http://localhost:5002/']; // Dominios permitidos
    const origin = req.headers.origin;

    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin); // Configura el encabezado según el origen de la solicitud
    }
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE'); // Métodos permitidos
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Encabezados permitidos
    res.header('Access-Control-Allow-Credentials', 'true'); // Si necesitas enviar cookies o autenticación
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );

  // Habilitar CORS
  app.enableCors({
    origin: ['https://novadrivingone.net', 'https://www.novadrivingone.net', 'https://dev.novadrivingone.net', 'https://www.dev.novadrivingone.net', 'http://localhost:8080'], // Cambia esto según el origen de tu frontend
    //origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Si necesitas enviar cookies o encabezados de autenticación
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
