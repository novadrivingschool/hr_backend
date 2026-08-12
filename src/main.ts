import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common'
import { json, urlencoded } from 'express'

console.log('Environment Variables:', JSON.stringify(process.env, null, 2)); // Depurar variables de entorno

async function bootstrap() {
  console.log('🕒 Backend timezone check:', new Date().toString());
  console.log('🕒 ISO:', new Date().toISOString());

  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Body parser con límite alto (el Excel de Horas Autorizadas envía la matriz completa)
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));

  // Middleware personalizado para configurar CORS manualmente
  app.use((req, res, next) => {
    const allowedOrigins = ['https://novadrivingone.net', 'https://www.novadrivingone.net', 'http://localhost:5002/', 'https://dev.go-nova.novadrivingone.net', 'https://go-nova.novadrivingone.net']; // Dominios permitidos
    const origin = req.headers.origin;

    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin); // Configura el encabezado según el origen de la solicitud
    }
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE'); // Métodos permitidos
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Rates-Token'); // Encabezados permitidos
    res.header('Access-Control-Allow-Credentials', 'true'); // Si necesitas enviar cookies o autenticación
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true, // required so @Type() transforms nested DTOs before whitelist check
    })
  );

  // Habilitar CORS
  app.enableCors({
    origin: ['https://novadrivingone.net', 'https://www.novadrivingone.net', 'https://dev.novadrivingone.net', 'https://www.dev.novadrivingone.net', 'http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:8090', 'http://127.0.0.1:8090', 'https://dev.go-nova.novadrivingone.net', 'https://go-nova.novadrivingone.net'],
    //origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    // Explícito (no reflejado) para que no dependa de qué middleware de CORS
    // "gane" — X-Rates-Token lo manda el frontend en /payroll/records/summary
    // y /payroll/records/summary/pdf (Nova y V-Out) desde que existe Rates.
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Rates-Token'],
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
